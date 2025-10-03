import { k8sGet } from '@openshift-console/dynamic-plugin-sdk';
import {
  GroupKind,
  isUserAuthorizedForApproval,
} from '../approval-group-utils';

// Mock the k8sGet function
jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  k8sGet: jest.fn(),
}));

const mockK8sGet = k8sGet as jest.MockedFunction<typeof k8sGet>;

describe('approval-group-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isUserAuthorizedForApproval', () => {
    it('should authorize user with direct assignment', async () => {
      const approvers = ['alice', 'bob', 'group:admin-team'];
      const result = await isUserAuthorizedForApproval('alice', approvers);
      expect(result).toBe(true);
      // Should not call k8sGet for direct user assignment
      expect(mockK8sGet).not.toHaveBeenCalled();
    });

    it('should authorize user through group membership', async () => {
      mockK8sGet.mockResolvedValue({
        metadata: { name: 'admin-team' },
        users: ['alice', 'bob', 'charlie'],
      } as GroupKind);

      const approvers = ['group:admin-team'];
      const result = await isUserAuthorizedForApproval('bob', approvers);

      expect(result).toBe(true);
      expect(mockK8sGet).toHaveBeenCalledWith({
        model: expect.objectContaining({
          kind: 'Group',
          plural: 'groups',
        }),
        name: 'admin-team',
      });
    });

    it('should deny user not in group', async () => {
      mockK8sGet.mockResolvedValue({
        metadata: { name: 'admin-team' },
        users: ['alice', 'bob'],
      } as GroupKind);

      const approvers = ['group:admin-team'];
      const result = await isUserAuthorizedForApproval('charlie', approvers);

      expect(result).toBe(false);
    });

    it('should handle group fetch errors gracefully', async () => {
      mockK8sGet.mockRejectedValue(new Error('Group not found'));

      const approvers = ['group:non-existent-group'];
      const result = await isUserAuthorizedForApproval('alice', approvers);

      expect(result).toBe(false);
    });

    it('should work with mixed approvers', async () => {
      mockK8sGet.mockResolvedValue({
        metadata: { name: 'dev-leads' },
        users: ['diana', 'eve'],
      } as GroupKind);

      const approvers = ['alice', 'group:admin-team', 'group:dev-leads'];
      const result = await isUserAuthorizedForApproval('diana', approvers);

      expect(result).toBe(true);
    });

    it('should handle empty approvers list', async () => {
      const result = await isUserAuthorizedForApproval('alice', []);
      expect(result).toBe(false);
    });

    it('should handle missing current user', async () => {
      const approvers = ['alice', 'group:admin-team'];
      const result = await isUserAuthorizedForApproval('', approvers);
      expect(result).toBe(false);
    });
  });
});
