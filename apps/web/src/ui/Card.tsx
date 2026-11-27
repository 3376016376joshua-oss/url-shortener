import { useId, type ReactNode } from 'react';
import { cx } from './cx.js';

export interface CardProps {
  /** Names the card; with it the card becomes a labelled section. */
  title?: string;
  description?: string;
  /** Controls shown beside the title, for example an "Add" button. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A bordered surface that groups related content. */
export function Card(props: CardProps) {
  const titleId = useId();
  const hasTitle = props.title !== undefined;
  return (
    <section
      aria-labelledby={hasTitle ? titleId : undefined}
      className={cx(
        'rounded-lg border border-slate-200 bg-white',
        props.className,
      )}
    >
      {hasTitle ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              {props.title}
            </h2>
            {props.description === undefined ? null : (
              <p className="mt-0.5 text-sm text-slate-600">
                {props.description}
              </p>
            )}
          </div>
          {props.actions}
        </header>
      ) : null}
      <div className="px-4 py-4 sm:px-6">{props.children}</div>
    </section>
  );
}
