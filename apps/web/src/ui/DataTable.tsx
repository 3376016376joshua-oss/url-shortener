import type { ReactNode } from 'react';
import { cx } from './cx.js';

export interface Column<Row> {
  /** Stable and unique among the table's columns. */
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** `end` for numbers and row actions. */
  align?: 'start' | 'end';
}

export interface DataTableProps<Row> {
  /** Names the table for assistive technology; not shown. */
  caption: string;
  columns: ReadonlyArray<Column<Row>>;
  rows: ReadonlyArray<Row>;
  rowKey: (row: Row) => string;
}

function alignment<Row>(column: Column<Row>): string {
  return column.align === 'end' ? 'text-right' : 'text-left';
}

/**
 * A table of records. On a narrow screen it scrolls sideways inside its own
 * frame, which is focusable so a keyboard can scroll it too.
 */
export function DataTable<Row>(props: DataTableProps<Row>) {
  return (
    <div
      role="region"
      aria-label={props.caption}
      tabIndex={0}
      // `relative`, so visually hidden content in a cell scrolls with the table
      // instead of widening the page.
      className="relative overflow-x-auto rounded-lg border border-slate-200 bg-white"
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{props.caption}</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {props.columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={cx(
                  'px-4 py-2.5 font-medium whitespace-nowrap text-slate-700',
                  alignment(column),
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr
              key={props.rowKey(row)}
              className="border-b border-slate-200 last:border-b-0"
            >
              {props.columns.map((column) => (
                <td
                  key={column.id}
                  className={cx('px-4 py-3 text-slate-900', alignment(column))}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
