import { generateLessonSessions } from '@/lib/actions/lessons'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Generate lesson sessions from timetable slots
 * 
 * Query params:
 * - termId: Academic term UUID (required)
 * - startDate: YYYY-MM-DD (default: today)
 * - endDate: YYYY-MM-DD (default: 30 days from start)
 * 
 * Example:
 * /api/generate-lessons?startDate=2024-01-15&endDate=2024-02-15
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const termId = searchParams.get('termId')
    if (!termId) {
      return NextResponse.json(
        { error: 'Missing termId (academic term id)' },
        { status: 400 }
      )
    }

    const startDate = searchParams.get('startDate') || new Date().toISOString().split('T')[0]
    const endDate = searchParams.get('endDate') || (
      new Date(new Date(startDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    )

    const result = await generateLessonSessions(termId, startDate, endDate)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Generate lessons API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate lessons', details: String(error) },
      { status: 500 }
    )
  }
}
