import { Link } from "react-router-dom";

/**
 * Cancel Button Component
 *
 * This component renders a cancel button that navigates to a specified URL.
 * It can optionally display an arrow icon and a custom label.
 *
 * @param {string} [label] - The label for the button. Defaults to "Cancel".
 * @param {string} to - The URL to navigate to when the button is clicked.
 * @param {boolean} [noArrow=false] - If true, the arrow icon is not displayed.
 * @returns A styled link component that acts as a cancel button.
 */
export default function BtnCancel({
  label,
  to,
  noArrow = false,
}: {
  label?: string;
  to: string;
  noArrow?: boolean;
}) {
  return (
    <Link className="btn btn-ghost btn-secondary align" to={to}>
      {noArrow ? null : "←"} {label || "Cancel"}
    </Link>
  );
}
