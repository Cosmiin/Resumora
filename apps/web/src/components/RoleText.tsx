import { careerBlocks } from "@resumora/contracts/editor/content";
/** Shared readable structure for AI proposals, Profile roles, CVs and print. */
export function RoleText({ text }: { text: string }) {
  return (
    <>
      {careerBlocks(text).map((b, i) =>
        b.kind === "paragraph" ? (
          <p key={i}>{b.text}</p>
        ) : b.kind === "ordered" ? (
          <ol key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ol>
        ) : (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}
