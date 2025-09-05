import { ExpandableField } from '@/components/form/expandable-field';
import { Textarea } from '@/components/ui/textarea';
import { useCursorToEnd } from '@/hooks/use-cursor-to-end';

function ExpandedTextArea({ ...props }) {
  const textareaRef = useCursorToEnd<HTMLTextAreaElement>();

  return (
    <Textarea
      {...props}
      ref={textareaRef}
      className="w-full max-h-full resize-none h-full"
      autoFocus
    />
  );
}

export function ExpandableTextArea({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof Textarea>) {
  return (
    <ExpandableField
      name={props.id || 'expandable-textarea'}
      label={label}
      compactView={<Textarea {...props} />}
      expandedView={<ExpandedTextArea {...props} />}
    />
  );
}
