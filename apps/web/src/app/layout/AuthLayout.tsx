import { Link, Outlet } from 'react-router';
import { Brand } from '../../ui/index.js';
import { paths } from '../paths.js';

/** The frame around the signed-out pages: the brand over a narrow column. */
export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10 sm:py-16">
      <Link to={paths.home} className="rounded-md">
        <Brand />
      </Link>
      <main className="mt-8 w-full max-w-md">
        <Outlet />
      </main>
    </div>
  );
}
