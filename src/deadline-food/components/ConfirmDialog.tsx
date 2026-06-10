import { AppButton } from "./primitives";

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmVariant = "danger",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-bold text-stone-900">{title}</h2>
        <p className="mt-2 text-sm text-stone-600">{message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <AppButton variant="ghost" onClick={onCancel}>Cancel</AppButton>
          <AppButton variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</AppButton>
        </div>
      </div>
    </div>
  );
}
