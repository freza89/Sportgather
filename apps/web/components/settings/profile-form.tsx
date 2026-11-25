'use client';

import { UpdateOrgSchema, formatPhone, type OrgSummary } from '@sportgather/shared';
import { Alert, Avatar, Button, Card, Input, Select } from '@sportgather/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, fieldErrors } from '@/lib/api-client';

export function ProfileForm({ org, canEdit }: { org: OrgSummary; canEdit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: org.name,
    city: org.city,
    whatsapp: org.whatsapp ? formatPhone(org.whatsapp) : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      city: form.city,
      ...(form.whatsapp ? { whatsapp: form.whatsapp } : {}),
    };
    const r = UpdateOrgSchema.safeParse(payload);
    setErrors(r.success ? {} : fieldErrors(r.error.issues));
    if (!r.success) return;
    setBusy(true);
    const res = await api<OrgSummary>('PATCH', `/orgs/${org.slug}`, payload);
    setBusy(false);
    setStatus(
      res.ok
        ? { tone: 'success', text: 'Perubahan disimpan.' }
        : { tone: 'danger', text: res.message },
    );
    if (res.ok) router.refresh();
  }

  return (
    <Card className="flex flex-col gap-5 p-5">
      <h2 className="type-h3">Profil klub</h2>
      <div className="flex items-center gap-4">
        <Avatar name={org.name} size={64} />
        <div className="flex flex-col gap-2">
          <span className="type-body-medium">Logo klub</span>
          <Button
            variant="secondary"
            disabled
            title="Unggah logo tersedia bersama penyimpanan dokumen (M2)"
          >
            Ganti logo
          </Button>
        </div>
      </div>
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        <fieldset disabled={!canEdit || busy} className="flex flex-col gap-4">
          <Input
            label="Nama klub"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={errors.name}
          />
          <Select
            label="Olahraga"
            value="basketball"
            disabled
            options={[{ value: 'basketball', label: 'Basket' }]}
          />
          <Input
            label="Kota"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            error={errors.city}
          />
          <Input
            label="WhatsApp klub"
            type="tel"
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            error={errors.whatsapp}
          />
        </fieldset>
        {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
        {canEdit ? (
          <Button type="submit" className="self-start" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan perubahan'}
          </Button>
        ) : null}
      </form>
    </Card>
  );
}
