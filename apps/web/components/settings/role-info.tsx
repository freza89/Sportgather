import { ROLE_DESCRIPTION, ROLE_LABEL, STAFF_ROLES } from '@sportgather/shared';
import { Alert, Card } from '@sportgather/ui';

export function RoleInfo() {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="type-h3">Hak akses per peran</h2>
      {STAFF_ROLES.map((r) => (
        <div key={r} className="rounded-control bg-canvas px-4 py-3">
          <p className="type-body-medium">{ROLE_LABEL[r]}</p>
          <p className="type-caption text-fg-secondary">{ROLE_DESCRIPTION[r]}</p>
        </div>
      ))}
      <Alert tone="info">
        Dokumen usia anak hanya bisa dibuka owner & admin; setiap akses tercatat di audit log.
      </Alert>
    </Card>
  );
}
