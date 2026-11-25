'use client';

import { Button, Card } from '@sportgather/ui';
import { useEffect, useState } from 'react';

/** Link formulir pendaftaran (REG-01) untuk dibagikan klub lewat WhatsApp. */
export function RegistrationLink({ slug }: { slug: string }) {
  const [url, setUrl] = useState(`/daftar/${slug}`);
  const [copied, setCopied] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- origin hanya diketahui di browser
  useEffect(() => setUrl(`${window.location.origin}/daftar/${slug}`), [slug]);
  return (
    <Card className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="type-body-medium">Link pendaftaran online</p>
        <p className="truncate type-caption text-fg-muted">{url}</p>
      </div>
      <Button
        variant="secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? 'Tersalin ✓' : 'Salin link'}
      </Button>
    </Card>
  );
}
