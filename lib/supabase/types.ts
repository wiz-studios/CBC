// Supabase type definitions
export type Database = {
  public: {
    Tables: {
      schools: {
        Row: {
          id: string
          name: string
          code: string
          motto: string | null
          principal_name: string | null
          principal_email: string | null
          phone: string | null
          address: string | null
          county: string | null
          sub_county: string | null
          school_type: 'PRIMARY' | 'SECONDARY' | 'BOTH'
          curriculum_version: string
          created_at: string
          updated_at: string
          is_active: boolean
        }
      }
      academic_terms: {
        Row: {
          id: string
          school_id: string
          year: number
          term: 1 | 2 | 3
          term_name: string | null
          start_date: string
          end_date: string
          is_current: boolean
          created_at: string
          updated_at: string
        }
      }
      class_subjects: {
        Row: {
          id: string
          class_id: string
          subject_id: string
          created_at: string
        }
      }
      users: {
        Row: {
          id: string
          school_id: string
          email: string
          first_name: string
          last_name: string
          phone: string | null
          id_number: string | null
          status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
          auth_id: string | null
          last_login: string | null
          created_at: string
          updated_at: string
        }
      }
      teachers: {
        Row: {
          id: string
          user_id: string
          school_id: string
          tsc_number: string | null
          is_head_of_department: boolean
          is_class_teacher: boolean
          created_at: string
        }
      }
      teacher_class_assignments: {
        Row: {
          id: string
          teacher_id: string
          class_id: string
          subject_id: string
          academic_term_id: string
          created_at: string
        }
      }
      students: {
        Row: {
          id: string
          school_id: string
          admission_number: string
          first_name: string
          last_name: string
          date_of_birth: string | null
          gender: string | null
          class_id: string
          academic_term_id: string
          created_at: string
          updated_at: string
        }
      }
      classes: {
        Row: {
          id: string
          school_id: string
          name: string
          grade_level: number
          stream: string | null
          class_teacher_id: string | null
          capacity: number | null
          created_at: string
          updated_at: string
          is_active: boolean
        }
      }
      subjects: {
        Row: {
          id: string
          school_id: string
          code: string
          name: string
          description: string | null
          curriculum_area: string | null
          is_compulsory: boolean
          created_at: string
        }
      }
      timetable_slots: {
        Row: {
          id: string
          academic_term_id: string
          teacher_id: string
          class_id: string
          subject_id: string
          day_of_week: number
          start_time: string
          end_time: string
          room: string | null
          created_at: string
          updated_at: string
        }
      }
      lesson_sessions: {
        Row: {
          id: string
          academic_term_id: string
          timetable_slot_id: string
          lesson_date: string
          teacher_id: string
          class_id: string
          subject_id: string
          session_status: 'OPEN' | 'SUBMITTED' | 'LOCKED'
          is_attended: boolean
          submitted_at: string | null
          locked_at: string | null
          locked_by_teacher_id: string | null
          lock_reason: string | null
          created_at: string
          updated_at: string
        }
      }
      attendance: {
        Row: {
          id: string
          lesson_session_id: string
          student_id: string
          status: 'PRESENT' | 'ABSENT'
          marked_at: string
          marked_by_teacher_id: string
          created_at: string
          updated_at: string
        }
      }
      assessment_types: {
        Row: {
          id: string
          school_id: string
          name: string
          weight: number
          max_score: number | null
          is_active: boolean
          created_at: string
        }
      }
      assessments: {
        Row: {
          id: string
          class_id: string
          subject_id: string
          teacher_id: string
          assessment_type_id: string
          academic_term_id: string
          title: string
          description: string | null
          assessment_date: string | null
          max_score: number
          created_at: string
          updated_at: string
        }
      }
      student_marks: {
        Row: {
          id: string
          student_id: string
          assessment_id: string
          score: number
          marked_at: string | null
          created_at: string
          updated_at: string
        }
      }
      student_subject_enrollments: {
        Row: {
          id: string
          school_id: string
          term_id: string
          student_id: string
          subject_id: string
          is_compulsory: boolean
          status: 'ACTIVE' | 'DROPPED'
          created_by: string | null
          enrolled_at: string
          dropped_at: string | null
          created_at: string
          updated_at: string
        }
      }
      grade_scales: {
        Row: {
          id: string
          school_id: string
          name: string
          is_default: boolean
          created_at: string
          updated_at: string
        }
      }
      grade_bands: {
        Row: {
          id: string
          grade_scale_id: string
          min_score: number
          max_score: number
          letter_grade: string
          points: number
          sort_order: number
          created_at: string
        }
      }
      school_results_settings: {
        Row: {
          id: string
          school_id: string
          grade_scale_id: string | null
          ranking_method: 'BEST_N' | 'ALL_TAKEN'
          ranking_n: number
          min_total_subjects: number
          max_total_subjects: number
          min_sciences: number
          max_humanities: number
          excluded_subject_codes: string[]
          cat_weight: number
          exam_weight: number
          updated_by: string | null
          created_at: string
          updated_at: string
        }
      }
      subject_results_profiles: {
        Row: {
          id: string
          school_id: string
          subject_id: string
          cat_weight: number | null
          exam_weight: number | null
          excluded_from_ranking: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
      }
      report_card_versions: {
        Row: {
          id: string
          student_id: string
          academic_term_id: string
          version_number: number
          generated_at: string
          generated_by_teacher_id: string
          status: 'DRAFT' | 'RELEASED'
          days_present: number | null
          days_absent: number | null
          attendance_percentage: number | null
          marks_snapshot: Record<string, unknown> | null
          total_marks: number | null
          average_percentage: number | null
          mean_points: number | null
          position_in_class: number | null
          class_size: number | null
          overall_grade: string | null
          ranking_method: string | null
          ranking_subject_count: number | null
          teacher_comments: string | null
          principal_comments: string | null
          position_in_stream: number | null
          stream_size: number | null
          released_at: string | null
          released_by_teacher_id: string | null
          created_at: string
        }
      }
      report_card_version_subjects: {
        Row: {
          id: string
          report_card_version_id: string
          subject_id: string
          marks_obtained: number | null
          max_marks: number | null
          percentage: number | null
          grade: string | null
          points: number | null
          position_in_subject: number | null
          subject_teacher_comments: string | null
          created_at: string
        }
      }
      roles: {
        Row: {
          id: string
          school_id: string | null
          name: string
          description: string | null
          is_system_role: boolean
          created_at: string
          updated_at: string
        }
      }
      permissions: {
        Row: {
          id: string
          name: string
          description: string | null
          resource: string
          action: string
          created_at: string
        }
      }
      role_permissions: {
        Row: {
          id: string
          role_id: string
          permission_id: string
          created_at: string
        }
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role_id: string
          school_id: string
          created_at: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          school_id: string
          user_id: string | null
          action: string
          resource_type: string
          resource_id: string | null
          changes: Record<string, unknown> | null
          created_at: string
        }
      }
    }
  }
}
