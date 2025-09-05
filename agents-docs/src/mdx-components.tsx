import defaultMdxComponents from 'fumadocs-ui/mdx';
import { APIPage } from 'fumadocs-openapi/ui';
import { openapi } from '@/lib/openapi';
import type { MDXComponents } from 'mdx/types';
import {
  Accordions,
  Accordion,
  Note,
  Warning,
  Tip,
  Card,
  pre,
  CodeGroup,
  Frame,
  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  a,
  Steps,
  Step,
  Tabs,
  Tab,
  Video,
} from '@inkeep/docskit/mdx';

// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    APIPage: (props) => <APIPage {...openapi.getAPIPageProps(props)} />,
    ...components,
    Accordions,
    Accordion,
    Note,
    Warning,
    Tip,
    Card,
    pre,
    CodeGroup,
    Frame,
    h1,
    h2,
    h3,
    h4,
    h5,
    h6,
    a,
    Steps,
    Step,
    Tabs,
    Tab,
    Video,
  };
}
