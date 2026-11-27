import {
  QR_SCAN_MARKER_PARAM,
  QR_SCAN_MARKER_VALUE,
} from '@url-shortener/contracts/qr';

/**
 * A link's public address. Short URLs take their scheme and port from
 * `APP_URL`, because the edge serves every host on the same listener.
 */
export function buildShortUrl(
  appUrl: string,
  hostname: string,
  code: string,
): string {
  const { protocol, port } = new URL(appUrl);
  const authority = port === '' ? hostname : `${hostname}:${port}`;
  return `${protocol}//${authority}/${code}`;
}

/**
 * What a link's QR code encodes: the short URL, never the destination, so a
 * printed code keeps working when the destination changes. The marker lets
 * the redirect count the visit as a scan (PRD section 9).
 */
export function buildQrContent(shortUrl: string): string {
  return `${shortUrl}?${QR_SCAN_MARKER_PARAM}=${QR_SCAN_MARKER_VALUE}`;
}
