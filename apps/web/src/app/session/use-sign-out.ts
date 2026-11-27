import { useMutation } from '@tanstack/react-query';
import { ApiError } from '../../api/api-error.js';
import { useApiClient } from '../../api/api-context.js';
import { describeError } from '../../api/describe-error.js';
import { useToast } from '../../ui/index.js';
import { paths } from '../paths.js';
import { leaveTo } from './leave-to.js';

export interface SignOut {
  signOut: () => void;
  isSigningOut: boolean;
}

/** Revokes the session, then leaves for the sign-in page. */
export function useSignOut(): SignOut {
  const api = useApiClient();
  const showToast = useToast();
  const mutation = useMutation({
    mutationFn: () => api.request('POST', '/auth/sign-out'),
    onSuccess: () => leaveTo(paths.signIn),
    onError: (error) => {
      // Already signed out: the shell is on its way to the sign-in page.
      if (error instanceof ApiError && error.isUnauthenticated) {
        return;
      }
      const { message } = describeError(error);
      showToast({ tone: 'error', message: `Could not sign out. ${message}` });
    },
  });
  return {
    signOut: () => mutation.mutate(),
    // Stays true after success, while the page is being left.
    isSigningOut: mutation.isPending || mutation.isSuccess,
  };
}
