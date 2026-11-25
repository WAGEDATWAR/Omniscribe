/** Bounds for page layouts and the fields of your own declared in them (docs/LAYOUTS.md). */
export const LAYOUT_LIMITS = Object.freeze({
  name: 60,
  ops: 500,
  sections: 20,
  ownFields: 60,
  label: 60,
  hint: 200,
  choices: 30,
  choiceLength: 40,
  text: 500,
  long: 5000,
  tags: 20,
  tagLength: 40
});

export const OWN_TYPES = Object.freeze(["text", "long", "number", "checkbox", "choice", "date", "tags"]);
export const OWN_TYPE_LABELS = Object.freeze({ text: "Text", long: "Long text", number: "Number", checkbox: "Yes or no", choice: "Choice", date: "Date", tags: "Tags" });
