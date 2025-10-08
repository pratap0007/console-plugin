import { ApprovalTaskKind } from '../../../types';
import {
    findUserInGroups,
    isDirectApprover,
    patchApprovalTask,
    patchGroupUserApproval,
    patchIndividualUserApproval,
} from '../approval-patch-utils';

// Mock k8sPatch
jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  k8sPatch: jest.fn(),
}));

const mockApprovalTask: ApprovalTaskKind = {
  apiVersion: 'openshift-pipelines.org/v1alpha1',
  kind: 'ApprovalTask',
  metadata: {
    name: 'test-approval',
    namespace: 'default',
  },
  spec: {
    approvers: [
      {
        input: 'pending',
        name: 'user1',
        type: 'User',
      },
      {
        input: 'pending',
        name: 'tekton-dev',
        type: 'Group',
        users: [
          {
            input: 'pending',
            name: 'tekton-user1',
          },
          {
            input: 'pending',
            name: 'tekton-user2',
          },
        ],
      },
    ],
    numberOfApprovalsRequired: 3,
    description: 'Test approval task',
  },
  status: {
    state: 'pending',
    approvers: ['user1', 'tekton-dev'],
    approvalsReceived: 0,
    approvalsRequired: 3,
    startTime: '2025-09-11T04:13:26Z',
    approversResponse: [
      {
        name: 'user1',
        response: 'pending',
        type: 'User',
      },
      {
        name: 'tekton-dev',
        response: 'pending',
        type: 'Group',
        groupMembers: [
          {
            name: 'tekton-user1',
            response: 'pending',
          },
          {
            name: 'tekton-user2',
            response: 'pending',
          },
        ],
      },
    ],
  },
};

describe('approval-patch-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findUserInGroups', () => {
    it('should find user in group', () => {
      const result = findUserInGroups(mockApprovalTask, 'tekton-user1');
      expect(result).toEqual({
        groupName: 'tekton-dev',
        isGroupMember: true,
      });
    });

    it('should return null if user not in any group', () => {
      const result = findUserInGroups(mockApprovalTask, 'user1');
      expect(result).toBeNull();
    });

    it('should return null if user does not exist', () => {
      const result = findUserInGroups(mockApprovalTask, 'nonexistent-user');
      expect(result).toBeNull();
    });
  });

  describe('isDirectApprover', () => {
    it('should return true for direct user approver', () => {
      const result = isDirectApprover(mockApprovalTask, 'user1');
      expect(result).toBe(true);
    });

    it('should return false for group member', () => {
      const result = isDirectApprover(mockApprovalTask, 'tekton-user1');
      expect(result).toBe(false);
    });

    it('should return false for non-approver', () => {
      const result = isDirectApprover(mockApprovalTask, 'nonexistent-user');
      expect(result).toBe(false);
    });
  });

  describe('patchGroupUserApproval', () => {
    it('should update group user approval correctly', async () => {
      const { k8sPatch } = require('@openshift-console/dynamic-plugin-sdk');
      k8sPatch.mockResolvedValue(mockApprovalTask);

      await patchGroupUserApproval(mockApprovalTask, {
        userName: 'tekton-user1',
        input: 'approve',
        message: 'Looks good!',
      });

      expect(k8sPatch).toHaveBeenCalledWith({
        model: expect.any(Object),
        resource: mockApprovalTask,
        data: expect.arrayContaining([
          expect.objectContaining({
            path: '/spec/approvers',
            op: 'replace',
          }),
          expect.objectContaining({
            path: '/status/approversResponse',
            op: 'replace',
          }),
        ]),
      });
    });

    it('should throw error if user not in any group', async () => {
      await expect(
        patchGroupUserApproval(mockApprovalTask, {
          userName: 'user1',
          input: 'approve',
        })
      ).rejects.toThrow('User user1 is not a member of any group');
    });
  });

  describe('patchIndividualUserApproval', () => {
    it('should update individual user approval correctly', async () => {
      const { k8sPatch } = require('@openshift-console/dynamic-plugin-sdk');
      k8sPatch.mockResolvedValue(mockApprovalTask);

      await patchIndividualUserApproval(mockApprovalTask, {
        userName: 'user1',
        input: 'approve',
        message: 'Approved!',
      });

      expect(k8sPatch).toHaveBeenCalledWith({
        model: expect.any(Object),
        resource: mockApprovalTask,
        data: expect.arrayContaining([
          expect.objectContaining({
            path: '/spec/approvers',
            op: 'replace',
          }),
          expect.objectContaining({
            path: '/status/approversResponse',
            op: 'replace',
          }),
        ]),
      });
    });

    it('should redirect to group logic if user is group member', async () => {
      const { k8sPatch } = require('@openshift-console/dynamic-plugin-sdk');
      k8sPatch.mockResolvedValue(mockApprovalTask);

      await patchIndividualUserApproval(mockApprovalTask, {
        userName: 'tekton-user1',
        input: 'approve',
      });

      expect(k8sPatch).toHaveBeenCalled();
    });

    it('should throw error if user is not an approver', async () => {
      await expect(
        patchIndividualUserApproval(mockApprovalTask, {
          userName: 'nonexistent-user',
          input: 'approve',
        })
      ).rejects.toThrow('User nonexistent-user is not an approver for this task');
    });
  });

  describe('patchApprovalTask', () => {
    it('should use group logic for group members', async () => {
      const { k8sPatch } = require('@openshift-console/dynamic-plugin-sdk');
      k8sPatch.mockResolvedValue(mockApprovalTask);

      await patchApprovalTask(mockApprovalTask, {
        userName: 'tekton-user1',
        input: 'approve',
      });

      expect(k8sPatch).toHaveBeenCalled();
    });

    it('should use individual logic for direct approvers', async () => {
      const { k8sPatch } = require('@openshift-console/dynamic-plugin-sdk');
      k8sPatch.mockResolvedValue(mockApprovalTask);

      await patchApprovalTask(mockApprovalTask, {
        userName: 'user1',
        input: 'approve',
      });

      expect(k8sPatch).toHaveBeenCalled();
    });

    it('should throw error for unauthorized users', async () => {
      await expect(
        patchApprovalTask(mockApprovalTask, {
          userName: 'unauthorized-user',
          input: 'approve',
        })
      ).rejects.toThrow('User unauthorized-user is not authorized to approve/reject this task');
    });
  });
});
