'use client'

import React from "react"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createSchool } from '@/lib/actions/schools'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

type SchoolType = 'PRIMARY' | 'SECONDARY' | 'BOTH'

export function CreateSchoolDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<{
    name: string
    code: string
    school_type: SchoolType
    principal_name: string
    principal_email: string
    phone: string
    address: string
    county: string
    sub_county: string
  }>({
    name: '',
    code: '',
    school_type: 'PRIMARY',
    principal_name: '',
    principal_email: '',
    phone: '',
    address: '',
    county: '',
    sub_county: '',
  })

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (value: string) => {
    setFormData((prev) => ({ ...prev, school_type: value as SchoolType }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (!formData.name || !formData.code) {
        toast.error('Please fill in required fields')
        return
      }

      const result = await createSchool(formData)
      if (!result.success) {
        toast.error('Failed to create school', { description: result.error.message })
        return
      }

      toast.success('School created successfully')
      setOpen(false)
      setFormData({
        name: '',
        code: '',
        school_type: 'PRIMARY',
        principal_name: '',
        principal_email: '',
        phone: '',
        address: '',
        county: '',
        sub_county: '',
      })

      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to create school')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add School
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New School</DialogTitle>
          <DialogDescription>Add a new school to the system</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">School Name *</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., Nairobi High School"
                value={formData.name}
                onChange={handleInputChange}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">School Code *</Label>
              <Input
                id="code"
                name="code"
                placeholder="e.g., KEN001"
                value={formData.code}
                onChange={handleInputChange}
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="school_type">School Type *</Label>
              <Select value={formData.school_type} onValueChange={handleSelectChange} disabled={loading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIMARY">Primary School</SelectItem>
                  <SelectItem value="SECONDARY">Secondary School</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="principal_name">Principal Name</Label>
              <Input
                id="principal_name"
                name="principal_name"
                placeholder="John Doe"
                value={formData.principal_name}
                onChange={handleInputChange}
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="principal_email">Principal Email</Label>
              <Input
                id="principal_email"
                name="principal_email"
                type="email"
                placeholder="principal@school.edu"
                value={formData.principal_email}
                onChange={handleInputChange}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                name="phone"
                placeholder="+254 XXX XXX XXX"
                value={formData.phone}
                onChange={handleInputChange}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              name="address"
              placeholder="School address"
              value={formData.address}
              onChange={handleInputChange}
              disabled={loading}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="county">County</Label>
              <Input
                id="county"
                name="county"
                placeholder="e.g., Nairobi"
                value={formData.county}
                onChange={handleInputChange}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub_county">Sub-County</Label>
              <Input
                id="sub_county"
                name="sub_county"
                placeholder="e.g., Westlands"
                value={formData.sub_county}
                onChange={handleInputChange}
                disabled={loading}
              />
            </div>
          </div>

          <div className="flex gap-4 justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create School'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
