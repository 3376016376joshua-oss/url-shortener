import { useLinkParams, type LinkTab } from '../../../../src/app/shell.js';
import { Card, PageHeader } from '../../../../src/ui/index.js';

function AnalyticsTab() {
  const { linkId } = useLinkParams();
  return <Card title="Analytics">Clicks for link {linkId}.</Card>;
}

function QrCodeTab() {
  const { linkId } = useLinkParams();
  return <Card title="QR code">The QR code of link {linkId}.</Card>;
}

export function LinkHeader() {
  const { linkId } = useLinkParams();
  return (
    <PageHeader title={`Link ${linkId}`} description="https://sho.rt/launch" />
  );
}

// Declared out of order on purpose: the frame sorts tabs by `order`.
export const linkTabs: LinkTab[] = [
  { id: 'qr-code', label: 'QR code', order: 20, Component: QrCodeTab },
  { id: 'analytics', label: 'Analytics', order: 10, Component: AnalyticsTab },
];
