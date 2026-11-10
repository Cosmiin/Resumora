import { useState, type ReactNode } from "react";
import {
  Block,
  Button,
  Checkbox,
  ChipGroup,
  CoachNote,
  Dialog,
  DiffRow,
  EmptyState,
  Input,
  LanguageSwitch,
  Mark,
  Menu,
  Progress,
  Radio,
  Select,
  Sheet,
  Stepper,
  Tabs,
  Tag,
  Textarea,
  ToastProvider,
  useToast,
  type DiffDecision,
} from "../ui/index.ts";

/** Development only (/dev/ui): every kit component in every state, on the real desk background. */
export function UiGallery() {
  return (
    <ToastProvider>
      <main className="ui-gallery">
        <header className="ui-gallery-head">
          <h1 className="ui-gallery-title">Component kit</h1>
          <LanguageSwitch />
        </header>
        <Buttons />
        <Fields />
        <Choices />
        <Surfaces />
        <Overlays />
        <ProgressAndSteps />
        <Diffs />
      </main>
    </ToastProvider>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ui-gallery-section">
      <h2 className="ui-gallery-h2">{title}</h2>
      <div className="ui-gallery-row">{children}</div>
    </section>
  );
}

function Buttons() {
  return (
    <Section title="Button">
      <Button variant="primary">Save this role</Button>
      <Button>Accept all for this role</Button>
      <Button variant="quiet">Skip this role for now</Button>
      <Button variant="danger">Delete my account</Button>
      <Button size="sm">Small</Button>
      <Button variant="primary" loading>
        Saving
      </Button>
      <Button disabled>Disabled</Button>
      <Button aria-pressed={true}>Chosen</Button>
    </Section>
  );
}

function Fields() {
  return (
    <Section title="Input, Textarea, Select">
      <div className="ui-gallery-col">
        <Input label="Name" defaultValue="Andrei Munteanu" />
        <Input label="Email" type="email" hint="We send the confirmation link here." placeholder="you@example.com" />
        <Input label="New password" type="password" error="Use at least 8 characters." defaultValue="abc" />
        <Input label="Disabled" disabled defaultValue="Can't change this" />
      </div>
      <div className="ui-gallery-col">
        <Textarea label="What should we emphasize?" placeholder="Type or speak your own" />
        <Select label="Tailoring language" defaultValue="en">
          <option value="en">English</option>
          <option value="ro">Romanian</option>
          <option value="de">German</option>
          <option value="fr">French</option>
          <option value="es">Spanish</option>
        </Select>
      </div>
    </Section>
  );
}

function Choices() {
  const [answer, setAnswer] = useState<string | null>("mid");
  return (
    <Section title="Checkbox, Radio, Chip, Tag">
      <div className="ui-gallery-col">
        <Checkbox label="Automation Specialist, Logistica Nord" defaultChecked />
        <Checkbox label="Sales Assistant, Electronics store" />
        <Radio name="gallery-template" label="Classic" defaultChecked />
        <Radio name="gallery-template" label="Modern" />
      </div>
      <div className="ui-gallery-col">
        <ChipGroup
          legend={<CoachNote as="span">About how many automations do you keep running today?</CoachNote>}
          options={[
            { value: "few", label: "Fewer than 10" },
            { value: "mid", label: "10 to 30" },
            { value: "many", label: "More than 30" },
          ]}
          value={answer}
          onChange={setAnswer}
        />
        <Tag>Inferred from your CV</Tag>
      </div>
    </Section>
  );
}

function Surfaces() {
  return (
    <Section title="Sheet, Block, CoachNote, Mark, EmptyState">
      <Sheet aria-label="CV sheet">
        <p>
          <Mark>Build and maintain 10–30 automations in Zapier and Make</Mark>
        </p>
        <p>Worked with Google Sheets and Airtable</p>
      </Sheet>
      <div className="ui-gallery-col">
        <Block>
          <CoachNote>Which teams used the automations you built?</CoachNote>
        </Block>
        <Block raised>
          <CoachNote>Answered question, lifted onto paper.</CoachNote>
          <CoachNote size="sm">Names REST APIs and webhooks, a must-have in this ad.</CoachNote>
        </Block>
      </div>
      <EmptyState title="No jobs yet" text="Open a job ad in your browser and click the Resumora extension. The job appears here." action={<Button variant="primary">Set up the extension</Button>} />
    </Section>
  );
}

function Overlays() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("cv");
  const toast = useToast();
  return (
    <Section title="Dialog, Menu, Tabs, Toast">
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your account?"
        actions={
          <>
            <Button variant="quiet" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <Button variant="danger" onClick={() => setOpen(false)}>
              Delete everything
            </Button>
          </>
        }
      >
        <p>This removes your CVs, jobs and answers. It can’t be undone.</p>
      </Dialog>
      <Menu
        label="Export"
        items={[
          { id: "pdf", label: "CV as PDF", onSelect: () => toast.show("CV downloaded as PDF") },
          { id: "docx", label: "CV as Word", onSelect: () => toast.show("CV downloaded as Word") },
          { id: "delete", label: "Delete this CV", danger: true, onSelect: () => toast.show("Couldn’t delete. Try again.", "error") },
        ]}
      />
      <Button onClick={() => toast.show("Saved. Next role: IT Support.")}>Show toast</Button>
      <div className="ui-gallery-col">
        <Tabs
          label="Document"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "cv", label: "CV", content: <p>The tailored CV.</p> },
            { id: "letter", label: "Cover letter", content: <p>The cover letter.</p> },
          ]}
        />
      </div>
    </Section>
  );
}

function ProgressAndSteps() {
  return (
    <Section title="Progress, Stepper">
      <div className="ui-gallery-col">
        <Progress label="Role 1 of 3" valueText="2 of 4 answered" value={2} max={4} />
        <Progress label="Keywords from the ad on your CV" valueText="6 of 10" value={6} max={10} tone="good" />
      </div>
      <Stepper label="Tailoring steps" steps={["Language", "Keywords", "Roles", "Summary and skills", "Finish"]} current={2} />
    </Section>
  );
}

function Diffs() {
  const [decisions, setDecisions] = useState<Record<string, DiffDecision | null>>({ b: { choice: "keep" }, c: { choice: "new", text: "Connect CRMs and internal tools through REST APIs and webhooks in Make" } });
  const decide = (id: string) => (decision: DiffDecision | null) => setDecisions((all) => ({ ...all, [id]: decision }));
  return (
    <Section title="DiffRow">
      <Sheet aria-label="Bullets for this role">
        <DiffRow
          textLang="en"
          oldText="Build and maintain 10–30 automations in Zapier and Make"
          newText="Build and maintain 10–30 production workflows in Make and Zapier for sales, accounting and operations"
          reason="Uses “production” and “workflows”, the ad’s own words."
          decision={decisions.a ?? null}
          onDecide={decide("a")}
        />
        <DiffRow
          textLang="en"
          inferred
          oldText="Worked with Google Sheets and Airtable"
          newText="Design data tables in Airtable and Google Sheets that the workflows read and write"
          reason="The ad asks for data models in Airtable and Google Sheets. Your CV doesn’t say you designed them."
          decision={decisions.b ?? null}
          onDecide={decide("b")}
        />
        <DiffRow
          textLang="en"
          oldText="Connect apps through their APIs in Make"
          newText="Connect CRMs and internal tools through REST APIs and webhooks in Make"
          reason="Names REST APIs and webhooks, a must-have in this ad."
          decision={decisions.c ?? null}
          onDecide={decide("c")}
        />
        <DiffRow textLang="en" oldText="Fix failed automations and add alerts so problems are caught sooner" newText={null} decision={null} onDecide={() => undefined} />
      </Sheet>
    </Section>
  );
}
