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

  it('service bon columns exist on customers, sites, devices, work_orders and werkbonnen', async () => {
    expect(await getColumns('customers')).toEqual(expect.arrayContaining([
      'customer_number', 'invoice_customer_number',
    ]))
    expect(await getColumns('sites')).toEqual(expect.arrayContaining(['closing_day']))
    expect(await getColumns('devices')).toEqual(expect.arrayContaining([
      'unit_number', 'delivery_date', 'warranty_until',
    ]))
    expect(await getColumns('work_orders')).toEqual(expect.arrayContaining([
      'ticket_number', 'ticket_date', 'created_at',
    ]))
    expect(await getColumns('werkbonnen')).toEqual(expect.arrayContaining([
      'bon_number', 'technician_id', 'device_id', 'visit_date', 'arrival_time',
      'departure_time', 'intervention_kind', 'trip_count', 'person_count',
      'remarks', 'signature_data',
    ]))
  })

  it('work_orders.device_id is nullable', async () => {
    const rows = await testSql<{ is_nullable: string }[]>`
      select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'work_orders' and column_name = 'device_id'
    `
    expect(rows[0]?.is_nullable).toBe('YES')
  })

  it('the service bon unique indexes exist', async () => {
    const rows = await testSql<{ indexname: string }[]>`
      select indexname from pg_indexes
      where schemaname = 'public'
        and indexname in ('customers_customer_number_unique', 'work_orders_ticket_number_unique')
      order by indexname
    `

    expect(rows.map(row => row.indexname)).toEqual([
      'customers_customer_number_unique',
      'work_orders_ticket_number_unique',
    ])
  })

  it('werkbonnen technician and device foreign keys delete with SET NULL', async () => {
    const rows = await testSql<{ column_name: string; delete_rule: string }[]>`
      select
        (select attname from pg_attribute
         where attrelid = c.conrelid and attnum = c.conkey[1]) as column_name,
        case c.confdeltype
          when 'n' then 'SET NULL'
          when 'c' then 'CASCADE'
          when 'a' then 'NO ACTION'
          when 'r' then 'RESTRICT'
          when 'd' then 'SET DEFAULT'
        end as delete_rule
      from pg_constraint c
      where c.conrelid = 'public.werkbonnen'::regclass
        and c.contype = 'f'
        and (select attname from pg_attribute
             where attrelid = c.conrelid and attnum = c.conkey[1]) in ('technician_id', 'device_id')
      order by column_name
    `

    expect(rows).toEqual([
      { column_name: 'device_id', delete_rule: 'SET NULL' },
      { column_name: 'technician_id', delete_rule: 'SET NULL' },
    ])
  })
})
