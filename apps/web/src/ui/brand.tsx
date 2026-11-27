import { cx } from './cx.js';

/** The name of the product, as shown in the chrome and in page titles. */
export const PRODUCT_NAME = 'URL Shortener';

/** The logo mark and the product name, side by side. */
export function Brand(props: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2 text-base font-semibold text-slate-900',
        props.className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-7 shrink-0 rounded-md bg-indigo-600 p-1 text-white"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
      </svg>
      {PRODUCT_NAME}
    </span>
  );
}
