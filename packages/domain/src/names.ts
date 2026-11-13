/** How an employee's name reads everywhere: the display name, or first, middle and last. */
export function employeeName(e: { display_name?: string | null; first_name: string; middle_name?: string | null; last_name?: string | null }): string {
  return e.display_name?.trim() || [e.first_name, e.middle_name, e.last_name].filter((x) => x && x.trim()).join(' ');
}

/** "Chrome on macOS" from a user agent; good enough for a device list. */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /curl|node|undici|lightMyRequest/i.test(ua)
              ? 'API client'
              : 'Browser';
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X|Macintosh/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return os ? `${browser} on ${os}` : browser;
}
