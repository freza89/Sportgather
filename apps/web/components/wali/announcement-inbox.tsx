'use client';

import type { MyAnnouncement } from '@sportgather/shared';
import { Badge, Card } from '@sportgather/ui';
import { useState } from 'react';
import { api } from '@/lib/api-client';

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

/** Daftar pengumuman; membuka satu pengumuman menandainya dibaca (COM-01/02). */
export function AnnouncementInbox({ items }: { items: MyAnnouncement[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [read, setRead] = useState(new Set(items.filter((i) => i.read).map((i) => i.id)));
  if (!items.length)
    return <Card className="p-5 type-body text-fg-secondary">Belum ada pengumuman.</Card>;
  return (
    <div className="flex flex-col gap-3">
      {items.map((a) => {
        const isOpen = open === a.id;
        return (
          <Card key={a.id} className="overflow-hidden">
            <button
              type="button"
              aria-expanded={isOpen}
              className="flex w-full items-start gap-3 p-4 text-left"
              onClick={() => {
                setOpen(isOpen ? null : a.id);
                if (!read.has(a.id)) {
                  setRead(new Set([...read, a.id]));
                  void api('POST', `/me/announcements/${a.id}/read`);
                }
              }}
            >
              <span className="flex flex-1 flex-col">
                <span className={read.has(a.id) ? 'type-body' : 'type-body-medium'}>{a.title}</span>
                <span className="type-caption text-fg-muted">
                  {a.orgName}
                  {a.authorName ? ` · ${a.authorName}` : ''} · {fmt(a.sentAt)}
                </span>
              </span>
              {!read.has(a.id) ? <Badge tone="brand">Baru</Badge> : null}
            </button>
            {isOpen ? (
              <p className="border-t border-line px-4 py-3 type-body whitespace-pre-line">
                {a.body}
              </p>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
