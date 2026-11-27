import { useState } from 'react';
import { NetworkError } from '../../../../src/api/api-error.js';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  CopyButton,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  Menu,
  MenuItem,
  MenuSeparator,
  PageHeader,
  SelectField,
  TextField,
  useToast,
  type Column,
} from '../../../../src/ui/index.js';

interface DnsRecord {
  type: string;
  name: string;
  value: string;
}

const MENU_BUTTON_CLASSES =
  'h-8 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium whitespace-nowrap';

const DNS_RECORDS: DnsRecord[] = [
  { type: 'TXT', name: '_shortener-challenge.go.brand.com', value: 'sv_4f9c' },
  { type: 'CNAME', name: 'go.brand.com', value: 'cname.sho.rt' },
];

function dnsColumns(onRemove: () => void): Array<Column<DnsRecord>> {
  return [
    { id: 'type', header: 'Type', cell: (record) => record.type },
    { id: 'name', header: 'Name', cell: (record) => record.name },
    { id: 'value', header: 'Value', cell: (record) => record.value },
    {
      id: 'copy',
      header: 'Copy',
      align: 'end',
      cell: (record) => (
        <CopyButton
          value={record.value}
          label={`Copy ${record.type} record value`}
        />
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'end',
      cell: (record) => (
        <Menu
          label={`Actions for the ${record.type} record`}
          button={`${record.type} actions`}
          buttonClassName={MENU_BUTTON_CLASSES}
        >
          <MenuItem onSelect={() => undefined}>Check again</MenuItem>
          <MenuItem onSelect={onRemove}>Remove record</MenuItem>
        </Menu>
      ),
    },
  ];
}

function Buttons() {
  return (
    <Card title="Buttons">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary">Primary</Button>
        <Button>Secondary</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="primary" loading>
          Saving
        </Button>
        <Button disabled>Disabled</Button>
        <Button size="sm">Small</Button>
        <ButtonLink to=".">Link</ButtonLink>
      </div>
    </Card>
  );
}

function Fields() {
  return (
    <Card title="Fields">
      <form className="flex flex-col gap-4">
        <TextField
          label="Destination"
          type="url"
          hint="Where the short link leads."
          placeholder="https://example.com/landing"
        />
        <TextField
          label="Custom code"
          defaultValue="a b"
          error="Use 3 to 32 letters, digits, hyphens, or underscores."
        />
        <SelectField label="Role" defaultValue="member">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </SelectField>
      </form>
    </Card>
  );
}

function Statuses() {
  return (
    <Card title="Badges and alerts">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="info">Pending</Badge>
          <Badge tone="success">Active</Badge>
          <Badge tone="warning">Expired</Badge>
          <Badge tone="danger">Blocked</Badge>
        </div>
        <Alert tone="info">DNS changes can take a few minutes.</Alert>
        <Alert tone="success" title="Verified">
          The domain is active.
        </Alert>
        <Alert tone="warning">This link expires tomorrow.</Alert>
        <Alert tone="danger" title="Could not save">
          The destination is not allowed.
        </Alert>
      </div>
    </Card>
  );
}

function States() {
  return (
    <Card title="States">
      <div className="flex flex-col gap-3">
        <LoadingState label="Loading domains" />
        <EmptyState
          title="No domains yet"
          description="Connect a domain to use it for short links."
          action={<Button variant="primary">Add domain</Button>}
        />
        <ErrorState
          title="The domains could not be loaded"
          error={new NetworkError()}
          onRetry={() => undefined}
        />
      </div>
    </Card>
  );
}

function Overlays(props: { onDelete: () => void }) {
  const showToast = useToast();
  return (
    <Card title="Overlays">
      <div className="flex flex-wrap items-start gap-2">
        <Button variant="danger" onClick={props.onDelete}>
          Delete link
        </Button>
        <Button
          onClick={() => showToast({ tone: 'success', message: 'Link saved' })}
        >
          Show toast
        </Button>
        <Menu
          label="Link actions"
          button="More actions"
          buttonClassName={MENU_BUTTON_CLASSES}
        >
          <MenuItem onSelect={() => undefined}>Duplicate</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => undefined}>Disable</MenuItem>
        </Menu>
      </div>
    </Card>
  );
}

export function KitGallery() {
  const [confirming, setConfirming] = useState(false);
  const confirm = () => setConfirming(true);
  const settle = () => setConfirming(false);
  return (
    <>
      <PageHeader
        title="Components"
        description="Every component of the kit, in each of its states."
        actions={<Button variant="primary">Primary action</Button>}
      />
      <div className="flex flex-col gap-6">
        <Buttons />
        <Fields />
        <Statuses />
        <States />
        <Overlays onDelete={confirm} />
        <DataTable
          caption="DNS records"
          columns={dnsColumns(confirm)}
          rows={DNS_RECORDS}
          rowKey={(record) => record.type}
        />
      </div>
      <ConfirmDialog
        open={confirming}
        title="Delete this link?"
        description="The short link stops working at once. This cannot be undone."
        confirmLabel="Delete link"
        onConfirm={settle}
        onCancel={settle}
      />
    </>
  );
}
