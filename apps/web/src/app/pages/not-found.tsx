import { ButtonLink, PageHeader } from '../../ui/index.js';
import { FullPage } from '../layout/FullPage.js';
import { paths } from '../paths.js';

export interface NotFoundStateProps {
  title?: string;
  description?: string;
}

/** "Not found", inside whichever layout the address belongs to. */
export function NotFoundState(props: NotFoundStateProps) {
  return (
    <>
      <PageHeader
        title={props.title ?? 'Page not found'}
        description={
          props.description ??
          'The address may be mistyped, or the page may have moved.'
        }
      />
      <ButtonLink to={paths.home} variant="primary">
        Go to the dashboard
      </ButtonLink>
    </>
  );
}

/** "Not found" for an address that belongs to no layout at all. */
export function NotFoundPage() {
  return (
    <FullPage>
      <NotFoundState />
    </FullPage>
  );
}
