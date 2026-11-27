import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Brand } from '../../ui/index.js';
import { paths } from '../paths.js';

/**
 * The frame for a page that stands outside every layout: the brand over one
 * centred message, such as "not found" or the session still loading.
 */
export function FullPage(props: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
      <Link to={paths.home} className="mb-8 self-start rounded-md">
        <Brand />
      </Link>
      <main>{props.children}</main>
    </div>
  );
}
