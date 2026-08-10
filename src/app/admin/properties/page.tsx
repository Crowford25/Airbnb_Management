import type { Metadata } from "next";

import { PageHeader } from "@/features/admin/components/page-header";
import {
  RoomBlockDeleteButton,
  RoomBlockForm,
  RoomStatusControl,
} from "@/features/admin/components/property-controls";
import { StatusBadge } from "@/features/admin/components/status-badge";
import { formatCurrency, formatDate, humanize } from "@/features/admin/format";
import { hasPermission } from "@/features/auth/rbac";
import { requirePermission } from "@/features/auth/server/authorization";
import { listInternalRooms, listUnitBlocks } from "@/server/db/repositories/inventory";
import { listProperties } from "@/server/db/repositories/properties";

export const metadata: Metadata = { title: "Property management" };

export default async function AdminPropertiesPage() {
  const user = await requirePermission("properties:view", "/admin/properties");
  const properties = await listProperties({ publishedOnly: false });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
  const propertyInventory = await Promise.all(
    properties.map(async (property) => {
      const [rooms, blocks] = await Promise.all([
        listInternalRooms(property.id),
        listUnitBlocks(property.id, today),
      ]);
      return { blocks, property, rooms };
    }),
  );
  const canManage = hasPermission(user.role, "properties:manage");

  return (
    <>
      <PageHeader
        description="Public room categories stay customer-friendly while physical room codes, operating states and date blocks remain private to staff."
        eyebrow={canManage ? "Manager controls" : "Read-only inventory"}
        title="Properties and rooms"
      />

      <div className="mt-8 grid gap-6">
        {propertyInventory.map(({ blocks, property, rooms }) => (
          <article
            className="border-border bg-surface overflow-hidden rounded-2xl border"
            key={property.id}
          >
            <header className="border-border flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold">{property.name}</h2>
                  <StatusBadge status={property.status} />
                </div>
                <p className="text-muted mt-2 text-sm">
                  {humanize(property.propertyType)} · {property.city}
                  {property.stateRegion ? `, ${property.stateRegion}` : ""} ·{" "}
                  {property.timezone}
                </p>
              </div>
              <a
                className="text-gold text-sm font-semibold"
                href={`/properties/${property.slug}`}
                rel="noreferrer"
                target="_blank"
              >
                View customer page ↗
              </a>
            </header>

            <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-2">
              <section>
                <h3 className="text-sm font-semibold">Customer-facing room types</h3>
                <div className="mt-4 grid gap-3">
                  {property.unitTypes.map((roomType) => {
                    const defaultRate =
                      roomType.ratePlans.find((rate) => rate.isDefault) ??
                      roomType.ratePlans[0];
                    return (
                      <div className="bg-background rounded-xl p-4" key={roomType.id}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold">{roomType.nameEn}</p>
                            <p className="text-muted mt-1 text-xs">
                              Up to {roomType.maxGuests} guests ·{" "}
                              {roomType.inventoryCount} physical{" "}
                              {roomType.inventoryCount === 1 ? "room" : "rooms"}
                            </p>
                          </div>
                          <p className="text-gold text-sm font-semibold">
                            {defaultRate
                              ? formatCurrency(
                                  defaultRate.baseNightlyRate,
                                  defaultRate.currency,
                                )
                              : "No rate"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Physical room register</h3>
                    <p className="text-muted mt-1 text-xs">
                      Private — never shown to guests
                    </p>
                  </div>
                  <p className="text-muted text-xs">{rooms.length} records</p>
                </div>
                <div className="mt-4 grid gap-3">
                  {rooms.map((room) => (
                    <div
                      className="bg-background flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between"
                      key={room.id}
                    >
                      <div>
                        <p className="font-mono text-sm font-semibold">
                          {room.internalCode}
                        </p>
                        <p className="text-muted mt-1 text-xs">
                          {room.roomName}
                          {room.floorLabel ? ` · ${room.floorLabel}` : ""}
                        </p>
                      </div>
                      {canManage ? (
                        <RoomStatusControl
                          initialStatus={room.status}
                          propertySlug={property.slug}
                          roomId={room.id}
                        />
                      ) : (
                        <StatusBadge status={room.status} />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="border-border bg-background/35 border-t p-5 sm:p-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold">Upcoming room blocks</h3>
                  <p className="text-muted mt-1 text-xs">
                    Maintenance, owner use and other non-bookable dates
                  </p>
                </div>
                <p className="text-muted text-xs">{blocks.length} active</p>
              </div>
              {blocks.length ? (
                <div className="mt-4 grid gap-2">
                  {blocks.slice(0, 10).map((block) => (
                    <div
                      className="border-border bg-surface grid gap-3 rounded-xl border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                      key={block.id}
                    >
                      <div>
                        <p className="text-sm font-semibold">
                          {block.roomName} · {block.internalCode}
                        </p>
                        <p className="text-muted mt-1 text-xs">
                          {humanize(block.reason)}
                          {block.note ? ` · ${block.note}` : ""}
                        </p>
                      </div>
                      <p className="text-muted text-xs">
                        {formatDate(block.startDate)} – {formatDate(block.endDate)}
                      </p>
                      {canManage ? (
                        <RoomBlockDeleteButton
                          blockId={block.id}
                          propertySlug={property.slug}
                        />
                      ) : null}
                    </div>
                  ))}
                  {blocks.length > 10 ? (
                    <p className="text-muted px-1 pt-1 text-xs">
                      Showing the next 10 of {blocks.length} active blocks.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-muted mt-4 text-sm">No upcoming blocks.</p>
              )}
              {canManage ? (
                <details className="border-border mt-5 rounded-xl border p-4">
                  <summary className="text-gold cursor-pointer text-sm font-semibold">
                    Add a room block
                  </summary>
                  <RoomBlockForm
                    minimumDate={today}
                    propertySlug={property.slug}
                    rooms={rooms.filter((room) => room.status !== "retired")}
                  />
                </details>
              ) : null}
            </section>
          </article>
        ))}
      </div>
    </>
  );
}
