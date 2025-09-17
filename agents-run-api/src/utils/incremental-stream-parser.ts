import { getLogger } from '../logger';
import { ArtifactParser, type StreamPart } from './artifact-parser';
import type { StreamHelper } from './stream-helpers';

const logger = getLogger('IncrementalStreamParser');

interface ParseResult {
  completeParts: StreamPart[];
  remainingBuffer: string;
}

/**
 * Incremental parser that processes streaming text and formats artifacts/objects as they become complete
 * Uses the unified ArtifactParser to eliminate redundancy
 */
export class IncrementalStreamParser {
  private buffer = '';
  private pendingTextBuffer = '';
  private streamHelper: StreamHelper;
  private artifactParser: ArtifactParser;
  private hasStartedRole = false;
  private collectedParts: StreamPart[] = [];
  private contextId: string;
  private lastChunkWasToolResult = false;
  private componentAccumulator: any = {};
  private lastStreamedComponents = new Map<string, any>();

  constructor(streamHelper: StreamHelper, tenantId: string, contextId: string) {
    this.streamHelper = streamHelper;
    this.contextId = contextId;
    this.artifactParser = new ArtifactParser(tenantId);
  }

  /**
   * Mark that a tool result just completed, so next text should have spacing
   */
  markToolResult(): void {
    this.lastChunkWasToolResult = true;
  }

  /**
   * Process a new text chunk for text streaming (handles artifact markers)
   */
  async processTextChunk(chunk: string): Promise<void> {
    // If this text follows a tool result and we haven't added any text yet, add spacing
    if (this.lastChunkWasToolResult && this.buffer === '' && chunk.trim()) {
      chunk = '\n\n' + chunk;
      this.lastChunkWasToolResult = false;
    }

    this.buffer += chunk;

    const parseResult = await this.parseTextBuffer();

    // Stream complete parts
    for (const part of parseResult.completeParts) {
      await this.streamPart(part);
    }

    // Update buffer with remaining content
    this.buffer = parseResult.remainingBuffer;
  }


  /**
   * Process object deltas directly from Vercel AI SDK's fullStream
   * Accumulates components until they're complete before streaming
   */
  async processObjectDelta(delta: any): Promise<void> {
    if (!delta || typeof delta !== 'object') {
      return;
    }

    // Deep merge delta into accumulator
    this.componentAccumulator = this.deepMerge(this.componentAccumulator, delta);

    // Check if we have dataComponents to process
    if (this.componentAccumulator.dataComponents && Array.isArray(this.componentAccumulator.dataComponents)) {
      const components = this.componentAccumulator.dataComponents;
      
      for (let i = 0; i < components.length; i++) {
        const component = components[i];
        
        const componentKey = component.id;
        const hasBeenStreamed = this.lastStreamedComponents.has(componentKey);
        
        // Stream this component if it's complete and we haven't streamed it yet
        if (this.isComponentComplete(component) && !hasBeenStreamed) {
          // Stream this complete component
          const parts = await this.artifactParser.parseObject({
            dataComponents: [component],
          });
          
          for (const part of parts) {
            await this.streamPart(part);
          }
          
          // Mark as streamed
          this.lastStreamedComponents.set(componentKey, true);
        }
      }
    }
  }

  /**
   * Check if a component is complete enough to stream
   * Components need id, name, and props to be considered complete
   */
  private isComponentComplete(component: any): boolean {
    if (!component || !component.id || !component.name) {
      return false;
    }

    // Must have props object
    if (!component.props || typeof component.props !== 'object') {
      return false;
    }

    // For artifacts, check if we have both required fields
    const isArtifact = component.name === 'Artifact' || 
                      (component.props.artifact_id && component.props.task_id);
    
    if (isArtifact) {
      // Artifacts must have both artifact_id and task_id
      return Boolean(component.props.artifact_id && component.props.task_id);
    }

    // For regular components, check if props has meaningful content
    // Could be customized based on your component schemas
    const propKeys = Object.keys(component.props);
    return propKeys.length > 0 && propKeys.some(key => component.props[key] !== null && component.props[key] !== undefined && component.props[key] !== '');
  }

  /**
   * Deep merge helper for object deltas
   */
  private deepMerge(target: any, source: any): any {
    if (!source) return target;
    if (!target) return source;

    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }


  /**
   * Legacy method for backward compatibility - defaults to text processing
   */
  async processChunk(chunk: string): Promise<void> {
    await this.processTextChunk(chunk);
  }

  /**
   * Process any remaining buffer content at the end of stream
   */
  async finalize(): Promise<void> {
    if (this.buffer.trim()) {
      // Process remaining buffer as final text
      const part: StreamPart = {
        kind: 'text',
        text: this.buffer.trim(),
      };
      await this.streamPart(part);
    }

    // Flush any remaining buffered text
    if (this.pendingTextBuffer.trim()) {
      // Clean up any artifact-related tags or remnants before final flush
      // Use safe, non-backtracking regex patterns to prevent ReDoS attacks
      const cleanedText = this.pendingTextBuffer
        .replace(/<\/?artifact:ref(?:\s[^>]*)?>\/?>/g, '') // Remove artifact:ref tags safely
        .replace(/<\/?artifact(?:\s[^>]*)?>\/?>/g, '') // Remove artifact tags safely
        .replace(/<\/(?:\w+:)?artifact>/g, '') // Remove closing artifact tags safely
        .trim();

      if (cleanedText) {
        this.collectedParts.push({
          kind: 'text',
          text: cleanedText,
        });

        await this.streamHelper.streamText(cleanedText, 50);
      }
      this.pendingTextBuffer = '';
    }
  }

  /**
   * Get all collected parts for building the final response
   */
  getCollectedParts(): StreamPart[] {
    return [...this.collectedParts];
  }

  /**
   * Parse buffer for complete artifacts and text parts (for text streaming)
   */
  private async parseTextBuffer(): Promise<ParseResult> {
    const completeParts: StreamPart[] = [];
    const workingBuffer = this.buffer;

    // Check if we have incomplete artifact markers
    if (this.artifactParser.hasIncompleteArtifact(workingBuffer)) {
      // Find safe boundary to stream text before incomplete artifact
      const safeEnd = this.artifactParser.findSafeTextBoundary(workingBuffer);

      if (safeEnd > 0) {
        const safeText = workingBuffer.slice(0, safeEnd);
        // Parse the safe portion for complete artifacts
        const parts = await this.artifactParser.parseText(safeText);
        completeParts.push(...parts);

        return {
          completeParts,
          remainingBuffer: workingBuffer.slice(safeEnd),
        };
      }

      // Buffer contains only incomplete artifact
      return {
        completeParts: [],
        remainingBuffer: workingBuffer,
      };
    }

    // No incomplete artifacts, parse the entire buffer
    const parts = await this.artifactParser.parseText(workingBuffer);

    // Check last part - if it's text, it might be incomplete
    if (parts.length > 0 && parts[parts.length - 1].kind === 'text') {
      const lastPart = parts[parts.length - 1];
      const lastText = lastPart.text || '';

      // Keep some text in buffer if it might be start of artifact
      if (this.mightBeArtifactStart(lastText)) {
        parts.pop(); // Remove last text part
        return {
          completeParts: parts,
          remainingBuffer: lastText,
        };
      }
    }

    return {
      completeParts: parts,
      remainingBuffer: '',
    };
  }


  /**
   * Check if text might be the start of an artifact marker
   */
  private mightBeArtifactStart(text: string): boolean {
    const lastChars = text.slice(-20); // Check last 20 chars
    return lastChars.includes('<') && !lastChars.includes('/>');
  }

  /**
   * Stream a formatted part (text or data) with smart buffering
   */
  private async streamPart(part: StreamPart): Promise<void> {
    // Collect for final response
    this.collectedParts.push({ ...part });

    if (!this.hasStartedRole) {
      await this.streamHelper.writeRole('assistant');
      this.hasStartedRole = true;
    }

    if (part.kind === 'text' && part.text) {
      // Add to pending buffer
      this.pendingTextBuffer += part.text;

      // Flush if safe to do so
      if (!this.artifactParser.hasIncompleteArtifact(this.pendingTextBuffer)) {
        // Clean up any artifact-related tags or remnants before flushing
        // Use safe, non-backtracking regex patterns to prevent ReDoS attacks
        const cleanedText = this.pendingTextBuffer
          .replace(/<\/?artifact:ref(?:\s[^>]*)?>\/?>/g, '') // Remove artifact:ref tags safely
          .replace(/<\/?artifact(?:\s[^>]*)?>\/?>/g, '') // Remove artifact tags safely
          .replace(/<\/(?:\w+:)?artifact>/g, ''); // Remove closing artifact tags safely

        if (cleanedText.trim()) {
          await this.streamHelper.streamText(cleanedText, 50);
        }
        this.pendingTextBuffer = '';
      }
    } else if (part.kind === 'data' && part.data) {
      // Flush any pending text before streaming data
      if (this.pendingTextBuffer) {
        // Clean up any artifact-related tags or remnants before flushing
        // Use safe, non-backtracking regex patterns to prevent ReDoS attacks
        const cleanedText = this.pendingTextBuffer
          .replace(/<\/?artifact:ref(?:\s[^>]*)?>\/?>/g, '') // Remove artifact:ref tags safely
          .replace(/<\/?artifact(?:\s[^>]*)?>\/?>/g, '') // Remove artifact tags safely
          .replace(/<\/(?:\w+:)?artifact>/g, ''); // Remove closing artifact tags safely

        if (cleanedText.trim()) {
          await this.streamHelper.streamText(cleanedText, 50);
        }
        this.pendingTextBuffer = '';
      }

      // Determine if this is an artifact or regular data component
      const isArtifact = part.data.artifactId && part.data.taskId;

      if (isArtifact) {
        await this.streamHelper.writeData('data-artifact', part.data);
      } else {
        await this.streamHelper.writeData('data-component', part.data);
      }
    }
  }
}
