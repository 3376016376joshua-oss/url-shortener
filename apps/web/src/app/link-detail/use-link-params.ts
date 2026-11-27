import { useParams } from 'react-router';

export interface LinkParams {
  workspaceId: string;
  linkId: string;
}

/** Which link the link detail frame is showing. For tabs and the link header. */
export function useLinkParams(): LinkParams {
  const { workspaceId, linkId } = useParams();
  if (workspaceId === undefined || linkId === undefined) {
    throw new Error(
      'useLinkParams() is only available inside the link detail frame',
    );
  }
  return { workspaceId, linkId };
}
