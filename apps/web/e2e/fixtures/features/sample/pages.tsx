import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { sessionQueryKey, useApiClient } from '../../../../src/api/index.js';
import {
  paths,
  resolveNextPath,
  useSession,
  useWorkspace,
} from '../../../../src/app/shell.js';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  QueryView,
  type Column,
} from '../../../../src/ui/index.js';

const linkListSchema = z.object({
  items: z.array(
    z.object({ id: z.string(), title: z.string(), shortUrl: z.string() }),
  ),
});
type ListedLink = z.infer<typeof linkListSchema>['items'][number];

/**
 * A stand-in for the real page. It ends the way the real one does: refresh
 * the session, then go where the visitor was heading.
 */
export function SignInPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const finishSignIn = async () => {
    await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    await navigate(resolveNextPath(location.search));
  };
  return (
    <Card>
      <PageHeader title="Sign in" description="A stand-in for the real page." />
      <Button variant="primary" onClick={() => void finishSignIn()}>
        Continue
      </Button>
    </Card>
  );
}

export function ProfilePage() {
  const { user } = useSession();
  return (
    <>
      <PageHeader title="Profile" />
      <Card title="Signed in as">
        <p>{user.email}</p>
      </Card>
    </>
  );
}

export function CreateWorkspacePage() {
  return <PageHeader title="Create a workspace" />;
}

export function MembersPage() {
  const workspace = useWorkspace();
  return (
    <>
      <PageHeader title="Members" />
      <p>
        Your role in {workspace.name}: <Badge>{workspace.role}</Badge>
      </p>
    </>
  );
}

export function BrokenPage(): never {
  throw new Error('This fixture page always fails to render');
}

function linkColumns(workspaceId: string): Array<Column<ListedLink>> {
  return [
    {
      id: 'title',
      header: 'Title',
      cell: (link) => (
        <Link
          to={paths.link(workspaceId, link.id)}
          className="font-medium text-indigo-700 underline"
        >
          {link.title}
        </Link>
      ),
    },
    { id: 'shortUrl', header: 'Short URL', cell: (link) => link.shortUrl },
  ];
}

export function LinksPage() {
  const api = useApiClient();
  const workspace = useWorkspace();
  const query = useQuery({
    queryKey: ['workspaces', workspace.id, 'links'],
    queryFn: ({ signal }) =>
      api.request('GET', `/workspaces/${workspace.id}/links`, {
        schema: linkListSchema,
        signal,
      }),
  });
  return (
    <>
      <PageHeader
        title="Links"
        description={`Every link in ${workspace.name}.`}
        actions={
          <ButtonLink to="new" variant="primary">
            Create link
          </ButtonLink>
        }
      />
      <QueryView
        query={query}
        loadingLabel="Loading links"
        errorTitle="The links could not be loaded"
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            title="No links yet"
            description="Create your first short link to see it here."
          />
        }
      >
        {(data) => (
          <DataTable
            caption="Links"
            columns={linkColumns(workspace.id)}
            rows={data.items}
            rowKey={(link) => link.id}
          />
        )}
      </QueryView>
    </>
  );
}
