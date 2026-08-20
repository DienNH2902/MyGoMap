interface LoadingSpinnerProps {
  label?: string;
}

export function CircleLoadingSpinner({ label }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink/60">
      <div className="relative flex h-5 w-5 items-center justify-center">
        <div className="loader"></div>
      </div>
      {label && <span>{label}</span>}

      <style jsx global>{`
        /* From Uiverse.io by KSAplay */
        .loader {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .loader::before,
        .loader::after {
          position: absolute;
          content: "";
          height: 8em;
          width: 8em;
          border: 1em solid #0060fa;
          border-radius: 50%;
          animation: loader_79178 2s linear infinite;
        }

        .loader::after {
          opacity: 0;
          animation-delay: 1s;
        }

        @keyframes loader_79178 {
          0% {
            border: 1em solid #0060fa;
            transform: scale(0);
            opacity: 1;
          }

          100% {
            border: 0 solid #0060fa;
            transform: scale(1);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
