'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { Database } from '@/lib/supabase/types'
import { getMySchool, updateMySchool } from '@/lib/actions/schools'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type SchoolRow = Database['public']['Tables']['schools']['Row']
type SchoolType = SchoolRow['school_type']

type FormState = {
  name: string
  motto: string
  principal_name: string
  principal_email: string
  phone: string
  address: string
  county: string
  sub_county: string
  school_type: SchoolType
  curriculum_version: string
}

export function SchoolSettingsForm({ canEdit }: { canEdit: boolean }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [school, setSchool] = useState<SchoolRow | null>(null)
  const [form, setForm] = useState<FormState | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getMySchool()
    if (!result.success) {
      toast.error('Failed to load school', { description: result.error.message })
      setSchool(null)
      setForm(null)
      setLoading(false)
      return
    }

    setSchool(result.school)
    setForm({
      name: result.school.name ?? '',
      motto: result.school.motto ?? '',
      principal_name: result.school.principal_name ?? '',
      principal_email: result.school.principal_email ?? '',
      phone: result.school.phone ?? '',
      address: result.school.address ?? '',
      county: result.school.county ?? '',
      sub_county: result.school.sub_county ?? '',
      school_type: result.school.school_type,
      curriculum_version: result.school.curriculum_version ?? 'CBC2023',
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    const result = await updateMySchool({
      name: form.name.trim(),
      motto: form.motto.trim() || null,
      principal_name: form.principal_name.trim() || null,
      principal_email: form.principal_email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      county: form.county.trim() || null,
      sub_county: form.sub_county.trim() || null,
      school_type: form.school_type,
      curriculum_version: form.curriculum_version.trim() || 'CBC2023',
    })

    if (!result.success) {
      toast.error('Update failed', { description: result.error.message })
      setSaving(false)
      return
    }

    toast.success('School settings updated')
    setSaving(false)
    await load()
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
        Loading school settings...
      </div>
    )
  }

  if (!school || !form) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-10 text-center">
        <p className="text-muted-foreground">Unable to load school settings.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 space-y-4">
          <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">School identity</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="school-name">School name</Label>
              <Input
                id="school-name"
                value={form.name}
                onChange={(e) => setForm((p) => (p ? { ...p, name: e.target.value } : p))}
                disabled={!canEdit || saving}
              />
            </div>

            <div className="space-y-2">
              <Label>School code</Label>
              <Input value={school.code} disabled />
            </div>

            <div className="space-y-2">
              <Label>School type</Label>
              <Select
                value={form.school_type}
                onValueChange={(v) => setForm((p) => (p ? { ...p, school_type: v as SchoolType } : p))}
                disabled={!canEdit || saving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIMARY">PRIMARY</SelectItem>
                  <SelectItem value="SECONDARY">SECONDARY</SelectItem>
                  <SelectItem value="BOTH">BOTH</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="curriculum">Curriculum version</Label>
              <Input
                id="curriculum"
                value={form.curriculum_version}
                onChange={(e) => setForm((p) => (p ? { ...p, curriculum_version: e.target.value } : p))}
                disabled={!canEdit || saving}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="motto">Motto</Label>
              <Input
                id="motto"
                value={form.motto}
                onChange={(e) => setForm((p) => (p ? { ...p, motto: e.target.value } : p))}
                disabled={!canEdit || saving}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 space-y-4">
          <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Leadership & contacts</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="principal-name">Principal name</Label>
              <Input
                id="principal-name"
                value={form.principal_name}
                onChange={(e) => setForm((p) => (p ? { ...p, principal_name: e.target.value } : p))}
                disabled={!canEdit || saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="principal-email">Principal email</Label>
              <Input
                id="principal-email"
                type="email"
                value={form.principal_email}
                onChange={(e) => setForm((p) => (p ? { ...p, principal_email: e.target.value } : p))}
                disabled={!canEdit || saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm((p) => (p ? { ...p, phone: e.target.value } : p))}
                disabled={!canEdit || saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="county">County</Label>
              <Input
                id="county"
                value={form.county}
                onChange={(e) => setForm((p) => (p ? { ...p, county: e.target.value } : p))}
                disabled={!canEdit || saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sub-county">Sub-county</Label>
              <Input
                id="sub-county"
                value={form.sub_county}
                onChange={(e) => setForm((p) => (p ? { ...p, sub_county: e.target.value } : p))}
                disabled={!canEdit || saving}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={form.address}
                onChange={(e) => setForm((p) => (p ? { ...p, address: e.target.value } : p))}
                disabled={!canEdit || saving}
                rows={3}
              />
            </div>
          </div>
        </div>
      </div>

      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          You can view these settings, but only a school admin can edit them.
        </p>
      )}
    </div>
  )
}
