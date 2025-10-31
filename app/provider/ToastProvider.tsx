"use client";

import { createContext, useState, useCallback, useEffect, ReactNode } from "react";
import ToastContainer from "../components/ToastContainer";
import { ToastType } from "../components/Toast";

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

interface ConfirmContextType {
  confirm: (message: string, title?: string) => Promise<boolean>;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);
export const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

interface ToastProviderProps {
  children: ReactNode;
}

export default function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    message: string;
    title?: string;
    resolve?: (value: boolean) => void;
  }>({
    isOpen: false,
    message: "",
  });

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, duration?: number) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, type, message, duration }]);
    },
    []
  );

  const success = useCallback(
    (message: string, duration?: number) => addToast("success", message, duration),
    [addToast]
  );

  const error = useCallback(
    (message: string, duration?: number) => addToast("error", message, duration),
    [addToast]
  );

  const warning = useCallback(
    (message: string, duration?: number) => addToast("warning", message, duration),
    [addToast]
  );

  const info = useCallback(
    (message: string, duration?: number) => addToast("info", message, duration),
    [addToast]
  );

  const confirm = useCallback((message: string, title?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        message,
        title,
        resolve,
      });
    });
  }, []);

  const handleConfirm = useCallback((value: boolean) => {
    setConfirmState((prev) => {
      const { resolve } = prev;
      setTimeout(() => resolve?.(value), 0);
      return {
        isOpen: false,
        message: "",
        title: undefined,
        resolve: undefined,
      };
    });
  }, []);

  useEffect(() => {
    if (!confirmState.isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleConfirm(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [confirmState.isOpen, handleConfirm]);

  return (
    <ToastContext.Provider value={{ success, error, warning, info }}>
      <ConfirmContext.Provider value={{ confirm }}>
        {children}
        <ToastContainer toasts={toasts} onClose={removeToast} />

        {/* Confirm Modal */}
        {confirmState.isOpen && (
          <div className="modal modal-open">
            <div
              className="modal-box"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
              aria-describedby="modal-description"
            >
              <h3 id="modal-title" className="font-bold text-lg">
                {confirmState.title || "Confirm"}
              </h3>
              <p id="modal-description" className="py-4">{confirmState.message}</p>
              <div className="modal-action">
                <button
                  className="btn btn-ghost"
                  onClick={() => handleConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleConfirm(true)}
                >
                  Confirm
                </button>
              </div>
            </div>
            <div className="modal-backdrop" onClick={() => handleConfirm(false)} />
          </div>
        )}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}
