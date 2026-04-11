# v1.10 Dataset Expansion Design

Date: 2026-04-11
Status: approved in chat

## Goal

Turn the staging dataset into a more realistic service database so the next versions can test:
- multiple devices per customer/site
- extra on-site work orders for another device
- device/customer history

## Scope

In scope:
- expand the demo customer dataset to roughly 15 realistic customers
- expand sites and devices so each customer/site has between 2 and 10 devices
- heavily enrich the customers that already appear in today's planning
- add historical dummy work orders in the database for those existing planning customers/devices
- reseed staging with the richer dataset
- release this as `v1.10`
- update repo changelog/version source
- update plan-site changenotes after staging matches

Out of scope:
- new UI to browse history
- new UI to create an extra work order for another device
- schema redesign for dedicated history tables

## Design

### Data strategy

Keep `v1.10` as a data release, not a behavior release.

Use the existing data model:
- customers
- sites
- devices
- work_orders
- assignments

Historical records are represented as older work orders tied to the same customer/site/device combination.

### Priorities

1. Existing planning customers get the richest expansion.
2. Those same customers get historical dummy work orders.
3. New customers/sites/devices broaden the dataset to a realistic scale.

### Release handling

This is a visible staging release:
- bump the shared release source to `v1.10`
- add repo changelog entry
- after staging is reseeded and verified, update the plan-site changenotes
