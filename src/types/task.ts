import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { ApproverInput, ApproverResponse } from './approvals';
import { TektonTaskSpec } from './coreTekton';

export type TaskKind = K8sResourceCommon & {
  spec: TektonTaskSpec;
};

export type SelectedBuilderTask = {
  resource: TaskKind;
  taskIndex: number;
  isFinallyTask: boolean;
};

export type CustomRunKind = K8sResourceCommon & {
  spec: {
    customRef: {
      apiVersion: string;
      kind: string;
    };
    params: {
      name: any;
      value: any;
    }[];
    serviceAccountName?: string;
  };
};

export type ApprovalTaskKind = K8sResourceCommon & {
  spec?: {
    approvers: {
      input: ApproverInput;
      message?: string;
      name: string;
      type: 'User' | 'Group';
      users?: {
        input: ApproverInput;
        name: string;
      }[];
    }[];
    numberOfApprovalsRequired: number;
    description?: string;
  };
  status?: {
    state: ApproverResponse;
    approvers: string[];
    approvalsReceived?: number;
    approvalsRequired?: number;
    startTime?: string;
    approversResponse?: {
      name: string;
      response: ApproverResponse;
      type: 'User' | 'Group';
      message?: string;
      groupMembers?: {
        name: string;
        response: ApproverResponse;
        message?: string;
      }[];
    }[];
  };
};
