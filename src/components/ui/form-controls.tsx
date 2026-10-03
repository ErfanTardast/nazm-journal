import { Field } from "@/components/ui/field";
import { Input, type InputProps } from "@/components/ui/input";
import { Select, type SelectProps } from "@/components/ui/select";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";

export function FormField({ label, hint, ...props }: InputProps & { label: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <Input {...props} />
    </Field>
  );
}

export function SelectField({ label, hint, children, ...props }: SelectProps & { label: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <Select {...props}>{children}</Select>
    </Field>
  );
}

export function TextAreaField({ label, hint, ...props }: TextareaProps & { label: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <Textarea {...props} />
    </Field>
  );
}
