"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { TextField, TextAreaField } from "@/components/ui/field";
import { MoneyField } from "@/components/ui/money-field";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FilterChip } from "@/components/ui/filter-chip";
import { MetricCard } from "@/components/ui/metric-card";
import { SaveBar } from "@/components/ui/save-bar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Notice } from "@/components/ui/feedback";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { AppShell } from "@/components/app-shell";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

export function DesignGallery() {
  const [darkMode, setDarkMode] = useState(false);
  const [money, setMoney] = useState("1000");
  const [quantity, setQuantity] = useState(5);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [filters, setFilters] = useState({
    processing: false,
    hold: false,
    failed: false,
  });
  const [changes, setChanges] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTypeOpen, setConfirmTypeOpen] = useState(false);
  const [richText, setRichText] = useState("<h2>Sample</h2><p>Hello <strong>world</strong></p>");

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
    setChanges(0);
  };

  const handleDiscard = () => {
    setChanges(0);
  };

  const toggleFilter = (key: keyof typeof filters) => {
    setFilters((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        {/* Theme Toggle */}
        <SectionCard
          title="Theme"
          description="Toggle between light and dark mode"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDarkMode(!darkMode)}
            className="inline-flex items-center gap-2"
          >
            {darkMode ? (
              <>
                <Sun className="size-4" />
                Light Mode
              </>
            ) : (
              <>
                <Moon className="size-4" />
                Dark Mode
              </>
            )}
          </Button>
        </SectionCard>

        {/* Text Fields */}
        <SectionCard
          title="Text Fields"
          description="Input fields in various states"
        >
          <div className="space-y-4">
            <TextField label="Normal field" placeholder="Enter text..." />
            <TextField
              label="Field with help"
              help="This is helpful context"
              placeholder="Enter text..."
            />
            <TextField
              label="Field with error"
              error="This field has an error"
              placeholder="Enter text..."
            />
            <TextField
              label="Disabled field"
              disabled
              defaultValue="Cannot edit"
              placeholder="Enter text..."
            />
            <TextField label="Optional field" optional placeholder="Enter text..." />
            <TextAreaField
              label="Text area"
              placeholder="Enter longer text..."
            />
          </div>
        </SectionCard>

        {/* Money Field */}
        <SectionCard
          title="Money Field"
          description="Formatted currency input"
        >
          <MoneyField
            label="Amount (INR)"
            currency="INR"
            value={money}
            onChange={setMoney}
            help="Enter amount in rupees"
          />
        </SectionCard>

        {/* Quantity Stepper */}
        <SectionCard
          title="Quantity Stepper"
          description="Increment/decrement quantity"
        >
          <QuantityStepper
            label="Quantity"
            value={quantity}
            onChange={setQuantity}
            min={0}
            max={99}
            help="Select quantity between 0 and 99"
          />
        </SectionCard>

        {/* Segmented Control */}
        <SectionCard
          title="Segmented Control"
          description="Toggle between options"
        >
          <SegmentedControl
            label="Visibility"
            value={visibility}
            onChange={setVisibility}
            options={[
              {
                value: "private",
                label: "Private",
                description: "Staff only",
              },
              {
                value: "public",
                label: "To customer",
                description: "Visible to the customer and may be emailed",
              },
            ]}
          />
        </SectionCard>

        {/* Filter Chips */}
        <SectionCard
          title="Filter Chips"
          description="Toggle filters with optional counts"
        >
          <div className="flex gap-2 flex-wrap">
            <FilterChip
              pressed={filters.processing}
              onPressedChange={() => toggleFilter("processing")}
              count={12}
            >
              Processing
            </FilterChip>
            <FilterChip
              pressed={filters.hold}
              onPressedChange={() => toggleFilter("hold")}
              count={3}
            >
              On hold
            </FilterChip>
            <FilterChip
              pressed={filters.failed}
              onPressedChange={() => toggleFilter("failed")}
              count={1}
            >
              Failed
            </FilterChip>
          </div>
        </SectionCard>

        {/* Metric Cards */}
        <SectionCard
          title="Metric Cards"
          description="Display key metrics with tone indicators"
        >
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
            <MetricCard
              tone="neutral"
              label="Total Orders"
              value={2451}
              hint="Last 30 days"
              definition="Total number of orders placed"
            />
            <MetricCard
              tone="info"
              label="In Progress"
              value={143}
              hint="Currently processing"
              definition="Orders being prepared"
            />
            <MetricCard
              tone="success"
              label="Completed"
              value={2102}
              hint="Delivered successfully"
              definition="Orders completed"
            />
            <MetricCard
              tone="warning"
              label="Pending"
              value={87}
              hint="Awaiting action"
              definition="Orders pending shipment"
            />
          </div>
        </SectionCard>

        {/* Order Status Badge */}
        <SectionCard
          title="Order Status Badges"
          description="Status indicators for orders"
        >
          <div className="flex gap-2 flex-wrap">
            <OrderStatusBadge status="pending" />
            <OrderStatusBadge status="processing" />
            <OrderStatusBadge status="on-hold" />
            <OrderStatusBadge status="completed" />
            <OrderStatusBadge status="cancelled" />
            <OrderStatusBadge status="refunded" />
            <OrderStatusBadge status="failed" />
            <OrderStatusBadge status="awaiting-shipment" />
          </div>
        </SectionCard>

        {/* Notices */}
        <SectionCard
          title="Notices"
          description="Inline messages for various tones"
        >
          <div className="space-y-3">
            <Notice tone="error">
              Something went wrong. Please try again.
            </Notice>
            <Notice tone="warning">
              This action cannot be undone. Proceed carefully.
            </Notice>
            <Notice tone="success">
              Changes saved successfully.
            </Notice>
            <Notice tone="info">
              New features are available. Learn more about updates.
            </Notice>
          </div>
        </SectionCard>

        {/* Save Bar Demo */}
        <SectionCard
          title="Save Bar"
          description="Demo with change counter"
        >
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Changes: {changes}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setChanges(changes + 1)}
            >
              Make a change
            </Button>
          </div>
        </SectionCard>

        {/* Confirm Dialogs */}
        <SectionCard
          title="Confirm Dialogs"
          description="Confirmation dialog variations"
        >
          <div className="space-y-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(true)}
            >
              Open Confirm Dialog
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmTypeOpen(true)}
            >
              Open Type Confirm Dialog
            </Button>
          </div>
        </SectionCard>

        {/* Rich Text Editor */}
        <SectionCard
          title="Rich Text Editor"
          description="WYSIWYG editor with formatting toolbar"
        >
          <div className="space-y-4">
            <RichTextEditor
              label="Editable description"
              value={richText}
              onChange={setRichText}
              help="Format your content with the toolbar"
            />
            <RichTextEditor
              label="Disabled editor"
              value="<p>This editor is disabled</p>"
              onChange={() => {}}
              disabled
            />
            <RichTextEditor
              label="With error"
              value=""
              onChange={() => {}}
              error="Description is required"
            />
          </div>
        </SectionCard>
      </div>

      {/* Save Bar */}
      <SaveBar
        changes={changes}
        onSave={handleSave}
        onDiscard={handleDiscard}
        saving={saving}
        summary="Click to save or discard changes"
      />

      {/* Dialogs */}
      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Action"
        description="Are you sure you want to proceed?"
        confirmLabel="Proceed"
        tier="confirm"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={confirmTypeOpen}
        title="Delete Item"
        description="This action cannot be undone. Type DELETE to confirm."
        confirmLabel="Delete"
        tier="type"
        phrase="DELETE"
        onCancel={() => setConfirmTypeOpen(false)}
        onConfirm={() => setConfirmTypeOpen(false)}
      />
    </AppShell>
  );
}
