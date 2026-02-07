'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { getAuditLogs, type AuditLogItem } from '@/lib/actions/audit'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function AuditLogTable({ showSchool }: { showSchool: boolean }) {
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<AuditLogItem[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getAuditLogs({ limit: 75 })
    if (!result.success) {
      toast.error('Failed to load audit logs', { description: result.error.message })
      setLogs([])
      setLoading(false)
      return
    }
    setLogs(result.logs)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 py-10 text-center text-muted-foreground">
          Loading audit logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 py-12 text-center">
          <p className="text-muted-foreground">No audit activity yet.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                {showSchool ? <TableHead>School</TableHead> : null}
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm text-muted-foreground">{new Date(row.created_at).toLocaleString()}</TableCell>
                  {showSchool ? (
                    <TableCell className="text-sm">
                      <div className="flex flex-col">
                        <span className="font-medium">{row.school?.name ?? row.school_id}</span>
                        <span className="text-xs text-muted-foreground">{row.school?.code ?? ''}</span>
                      </div>
                    </TableCell>
                  ) : null}
                  <TableCell className="text-sm">
                    {row.actor ? (
                      <div className="flex flex-col">
                        <span className="font-medium">{row.actor.email}</span>
                        <span className="text-xs text-muted-foreground">
                          {row.actor.first_name} {row.actor.last_name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <Badge variant="outline">{row.action}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.resource_type}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
