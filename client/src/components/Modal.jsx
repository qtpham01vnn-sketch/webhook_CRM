import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, title, description, children, onClose, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-[2px] sm:py-6"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      role="presentation"
    >
      <section
        aria-modal="true"
        className={`modal-scroll my-auto min-h-0 w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} max-h-[calc(100vh-2rem)] overflow-y-scroll overscroll-contain rounded-2xl bg-white p-6 shadow-2xl`}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
            {description && (
              <p className="mt-1.5 text-sm leading-6 text-muted">{description}</p>
            )}
          </div>
          <button
            aria-label="Dong modal"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </section>
    </div>
  );
}
