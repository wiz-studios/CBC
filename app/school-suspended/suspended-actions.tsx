'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth'

export function SuspendedActions() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleSignOut = async () => {
    setLoading(true)
    try {
      const result = await signOut()
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Signed out')
      router.push('/auth')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to sign out')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
      <Button variant="outline" onClick={() => router.refresh()} disabled={loading}>
        Refresh
      </Button>
      <Button onClick={handleSignOut} disabled={loading}>
        {loading ? 'Signing out...' : 'Sign out'}
      </Button>
    </div>
  )
}

