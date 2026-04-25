import { describe, expect, it } from 'vitest'
import { testSql } from './setup'

async function getColumns(tableName: string): Promise<string[]> {
  const rows = await testSql<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
    order by ordinal_position
  `

  return rows.map(row => row.column_name)
}

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await testSql<{ regclass: string | null }[]>`
    select to_regclass(${`public.${tableName}`}) as regclass
  `

  return rows[0]?.regclass != null
}

describe('database schema validation', () => {
  it('task system tables exist with the expected columns', async () => {
    expect(await tableExists('tasks')).toBe(true)
    expect(await tableExists('task_dependencies')).toBe(true)
    expect(await tableExists('task_templates')).toBe(true)
    expect(await tableExists('task_template_edges')).toBe(true)
    expect(await tableExists('work_order_links')).toBe(true)
    expect(await tableExists('work_order_events')).toBe(true)

    expect(await getColumns('tasks')).toEqual(expect.arrayContaining([
      'id',
      'work_order_id',
      'werkbon_id',
      'template_id',
      'type',
      'role',
      'status',
      'title',
      'description',
      'assignee_id',
      'seq',
      'due_date',
      'completed_at',
      'completed_by',
      'skip_reason',
      'reason_code',
      'payload',
      'created_at',
      'created_by',
      'updated_at',
    ]))

    expect(await getColumns('task_dependencies')).toEqual(expect.arrayContaining([
      'id',
      'predecessor_id',
      'successor_id',
      'dep_type',
      'lag_minutes',
    ]))

    expect(await getColumns('task_templates')).toEqual(expect.arrayContaining([
      'id',
      'name',
      'default_role',
      'default_type',
      'trigger_on_complete',
      'auto_create',
      'delay_minutes',
      'active',
    ]))

    expect(await getColumns('task_template_edges')).toEqual(expect.arrayContaining([
      'id',
      'from_template_id',
      'to_template_id',
      'dep_type',
      'auto_create',
    ]))

    expect(await getColumns('work_order_links')).toEqual(expect.arrayContaining([
      'id',
      'from_work_order_id',
      'to_work_order_id',
      'link_type',
      'reason_code',
      'note',
      'created_at',
    ]))

    expect(await getColumns('work_order_events')).toEqual(expect.arrayContaining([
      'id',
      'occurred_at',
      'recorded_at',
      'work_order_id',
      'task_id',
      'actor_id',
      'event_type',
      'payload',
      'client_id',
    ]))
  })

  it('work_orders includes external_ref and preserves the existing core columns', async () => {
    const columns = await getColumns('work_orders')

    expect(columns).toEqual(expect.arrayContaining([
      'external_ref',
      'id',
      'customer_id',
      'site_id',
      'device_id',
      'status',
      'type',
      'source',
      'planned_date',
      'is_urgent',
      'planning_version',
    ]))
  })
})
