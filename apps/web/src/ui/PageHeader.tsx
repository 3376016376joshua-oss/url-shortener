import type { ReactNode } from 'react';
import { PRODUCT_NAME } from './brand.js';

export interface PageHeaderProps {
  /** The page's one `<h1>`, and the first part of the browser tab's title. */
  title: string;
  description?: string;
  /** The page's primary controls, for example a "Create link" button. */
  actions?: ReactNode;
}

/** The top of every view: its heading, and with it the document title. */
export function PageHeader(props: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <title>{`${props.title} - ${PRODUCT_NAME}`}</title>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight wrap-break-word text-slate-900">
          {props.title}
        </h1>
        {props.description === undefined ? null : (
          <p className="mt-1 text-sm text-slate-600">{props.description}</p>
        )}
      </div>
      {props.actions === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2">{props.actions}</div>
      )}
    </header>
  );
}
