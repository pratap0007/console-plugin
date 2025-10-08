import { k8sPatch } from '@openshift-console/dynamic-plugin-sdk';
import { ApprovalTaskModel } from '../../models';
import { ApprovalTaskKind, ApproverInput, ApproverResponse } from '../../types';

export interface ApprovalPatchOptions {
  userName: string;
  input: ApproverInput;
  message?: string;
}

/**
 * Check if a user is a member of any group in the approval task
 */
export const findUserInGroups = (
  approvalTask: ApprovalTaskKind,
  userName: string,
): { groupName: string; isGroupMember: boolean } | null => {
  const { spec } = approvalTask;
  if (!spec?.approvers) return null;

  for (const approver of spec.approvers) {
    if (approver.type === 'Group' && approver.users) {
      const userInGroup = approver.users.find(user => user.name === userName);
      if (userInGroup) {
        return { groupName: approver.name, isGroupMember: true };
      }
    }
  }
  return null;
};

/**
 * Check if a user is a direct approver (not part of a group)
 */
export const isDirectApprover = (
  approvalTask: ApprovalTaskKind,
  userName: string,
): boolean => {
  const { spec } = approvalTask;
  if (!spec?.approvers) return false;

  return spec.approvers.some(
    approver => approver.type === 'User' && approver.name === userName
  );
};

/**
 * Patch operations for group user approval/rejection
 */
export const patchGroupUserApproval = async (
  approvalTask: ApprovalTaskKind,
  options: ApprovalPatchOptions,
): Promise<ApprovalTaskKind> => {
  const { userName, input, message } = options;
  const groupInfo = findUserInGroups(approvalTask, userName);
  
  if (!groupInfo) {
    throw new Error(`User ${userName} is not a member of any group`);
  }

  const { groupName } = groupInfo;
  const updatedApprovers = approvalTask.spec.approvers.map((approver) => {
    if (approver.name === groupName && approver.type === 'Group') {
      // Update group input based on user action
      const updatedUsers = approver.users?.map(user => 
        user.name === userName 
          ? { ...user, input, ...(message && { message }) }
          : user
      ) || [];

      // Determine group input based on user inputs
      const approvedUsers = updatedUsers.filter(user => user.input === 'approve').length;
      const rejectedUsers = updatedUsers.filter(user => user.input === 'reject').length;
      const totalUsers = updatedUsers.length;

      let groupInput: ApproverInput = 'pending';
      if (approvedUsers === totalUsers) {
        groupInput = 'approve';
      } else if (rejectedUsers > 0) {
        groupInput = 'reject';
      }

      return {
        ...approver,
        input: groupInput,
        users: updatedUsers,
      };
    }
    return approver;
  });

  // Update status.approversResponse for the group
  const updatedApproversResponse = approvalTask.status?.approversResponse?.map(response => {
    if (response.name === groupName && response.type === 'Group') {
      const updatedGroupMembers = response.groupMembers?.map(member =>
        member.name === userName
          ? { 
              ...member, 
              response: input === 'approve' ? 'approved' : input === 'reject' ? 'rejected' : 'pending',
              ...(message && { message })
            }
          : member
      ) || [];

      // Determine group response based on member responses
      const approvedMembers = updatedGroupMembers.filter(member => member.response === 'approved').length;
      const rejectedMembers = updatedGroupMembers.filter(member => member.response === 'rejected').length;
      const totalMembers = updatedGroupMembers.length;

      let groupResponse: ApproverResponse = 'pending';
      if (approvedMembers === totalMembers) {
        groupResponse = 'approved';
      } else if (rejectedMembers > 0) {
        groupResponse = 'rejected';
      }

      return {
        ...response,
        response: groupResponse,
        groupMembers: updatedGroupMembers,
        ...(message && { message }),
      };
    }
    return response;
  }) || [];

  const patchData = [
    {
      path: '/spec/approvers',
      op: 'replace',
      value: updatedApprovers,
    },
    {
      path: '/status/approversResponse',
      op: 'replace',
      value: updatedApproversResponse,
    },
  ];

  return k8sPatch({
    model: ApprovalTaskModel,
    resource: approvalTask,
    data: patchData,
  });
};

/**
 * Patch operations for individual user approval/rejection
 */
export const patchIndividualUserApproval = async (
  approvalTask: ApprovalTaskKind,
  options: ApprovalPatchOptions,
): Promise<ApprovalTaskKind> => {
  const { userName, input, message } = options;

  // Check if user is a group member first
  const groupInfo = findUserInGroups(approvalTask, userName);
  if (groupInfo) {
    // If user is part of a group, use group patch logic
    return patchGroupUserApproval(approvalTask, options);
  }

  // Check if user is a direct approver
  if (!isDirectApprover(approvalTask, userName)) {
    throw new Error(`User ${userName} is not an approver for this task`);
  }

  // Use existing individual approval logic
  const updatedApprovers = approvalTask.spec.approvers.map((approver) => {
    if (approver.name === userName && approver.type === 'User') {
      return {
        ...approver,
        input,
        ...(message && { message }),
      };
    }
    return approver;
  });

  // Update status.approversResponse for individual user
  const updatedApproversResponse = approvalTask.status?.approversResponse?.map(response => {
    if (response.name === userName && response.type === 'User') {
      return {
        ...response,
        response: input === 'approve' ? 'approved' : input === 'reject' ? 'rejected' : 'pending',
        ...(message && { message }),
      };
    }
    return response;
  }) || [];

  const patchData = [
    {
      path: '/spec/approvers',
      op: 'replace',
      value: updatedApprovers,
    },
    {
      path: '/status/approversResponse',
      op: 'replace',
      value: updatedApproversResponse,
    },
  ];

  return k8sPatch({
    model: ApprovalTaskModel,
    resource: approvalTask,
    data: patchData,
  });
};

/**
 * Main patch function that determines whether to use group or individual logic
 */
export const patchApprovalTask = async (
  approvalTask: ApprovalTaskKind,
  options: ApprovalPatchOptions,
): Promise<ApprovalTaskKind> => {
  const { userName } = options;

  // Check if user is a group member
  const groupInfo = findUserInGroups(approvalTask, userName);
  if (groupInfo) {
    return patchGroupUserApproval(approvalTask, options);
  }

  // Check if user is a direct approver
  if (isDirectApprover(approvalTask, userName)) {
    return patchIndividualUserApproval(approvalTask, options);
  }

  throw new Error(`User ${userName} is not authorized to approve/reject this task`);
};
