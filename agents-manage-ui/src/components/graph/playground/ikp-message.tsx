import type { Message } from "@inkeep/cxkit-react-oss/types";
import { BookOpen, Check, ChevronRight, LoaderCircle } from "lucide-react";
import { type FC, useEffect, useState, useRef } from "react";
import supersub from "remark-supersub";
import { Streamdown } from "streamdown";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface IkpMessageProps {
	message: Message;
	isStreaming?: boolean;
	renderMarkdown: (text: string) => React.ReactNode;
	renderComponent: (name: string, props: any) => React.ReactNode;
}

// Citation Badge Component
const CitationBadge: FC<{
	citation: { key: string; href?: string; artifact: any };
}> = ({ citation }) => {
	const { key, href, artifact } = citation;

	const badge = (
		<span
			className={`citation-badge inline-flex items-center justify-center h-5 min-w-5 px-2 mr-1 text-xs font-medium bg-gray-50 dark:bg-muted text-gray-700 dark:text-foreground hover:bg-gray-100 dark:hover:bg-muted/80 rounded-full border border-gray-200 dark:border-border transition-colors ${
				href ? "cursor-pointer" : "cursor-help"
			}`}
		>
			{key}
		</span>
	);

	const tooltipContent = (
		<div className="p-2">
			<div className="font-medium text-sm mb-1 text-popover-foreground">
				{artifact.name}
			</div>
			<div className="text-xs text-muted-foreground leading-relaxed">
				{artifact.description}
			</div>
		</div>
	);

	if (href) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<a
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						className="no-underline"
					>
						{badge}
					</a>
				</TooltipTrigger>
				<TooltipContent className="max-w-xs">{tooltipContent}</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>{badge}</TooltipTrigger>
			<TooltipContent className="max-w-xs">{tooltipContent}</TooltipContent>
		</Tooltip>
	);
};

// Grouped Data Operations Component
const GroupedDataOperations: FC<{
	operations: any[];
	isCompleted: boolean;
	startTime: number;
}> = ({ operations, isCompleted, startTime }) => {
	const [isExpanded, setIsExpanded] = useState(!isCompleted); // Start expanded when thinking
	const [elapsedTime, setElapsedTime] = useState(0);

	// Update elapsed time every 100ms when not completed
	useEffect(() => {
		if (!isCompleted) {
			const interval = setInterval(() => {
				setElapsedTime(Date.now() - startTime);
			}, 100);
			return () => clearInterval(interval);
		} else {
			// Set final elapsed time when completed
			setElapsedTime(Date.now() - startTime);
		}
	}, [isCompleted, startTime]);

	// Auto-collapse when transitioning from thinking to completed
	useEffect(() => {
		if (isCompleted) {
			// Add a small delay before collapsing to let users see the completion
			const timer = setTimeout(() => {
				setIsExpanded(false);
			}, 1000); // 1 second delay
			return () => clearTimeout(timer);
		} else {
			// Auto-expand when thinking
			setIsExpanded(true);
		}
	}, [isCompleted]);

	const getOperationLabel = (operation: any) => {
		const { type } = operation;
		// Use LLM-generated label if available (for status updates and other operations)
		if (operation.label) {
			return operation.label;
		}

		switch (type) {
			case "agent_initializing":
				return "Agent initializing";
			case "agent_ready":
				return "Agent ready";
			case "completion":
				return "Completion";
			case "status_update":
				return "Status update";
			default:
				return type
					.replace(/_/g, " ")
					.replace(/\b\w/g, (l: string) => l.toUpperCase());
		}
	};

	const formatElapsedTime = (ms: number) => {
		const seconds = Math.floor(ms / 1000);
		const milliseconds = Math.floor((ms % 1000) / 100);
		return seconds > 0 ? `${seconds}.${milliseconds}s` : `${Math.floor(ms)}ms`;
	};

	return (
		<div className="flex flex-col items-start mb-2.5 mt-2.5 first:mt-1 relative">
			{/* Main thinking/thought indicator - now collapsible */}
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="inline-flex items-center group gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer ml-1"
			>
				{isCompleted ? (
					<>
						<Check
							className={cn(
								"w-3 h-3 text-gray-500 dark:text-muted-foreground transition-all duration-200 absolute",
								isExpanded ? "opacity-0" : "opacity-100 group-hover:opacity-0",
							)}
						/>
						<ChevronRight
							className={cn(
								"w-3 h-3 text-gray-500 dark:text-muted-foreground transition-all duration-200 transform",
								isExpanded
									? "rotate-90 opacity-100"
									: "rotate-0 opacity-0 group-hover:opacity-100",
							)}
						/>
						<span className="font-medium">
							Thought for {formatElapsedTime(elapsedTime)}
						</span>
					</>
				) : (
					<>
						<LoaderCircle className="w-3 h-3 animate-spin" />
						<span className="font-medium">Thinking...</span>
					</>
				)}
			</button>

			{/* Expandable operations list with smooth transition */}
			<div
				className={cn(
					"overflow-hidden transition-all duration-300 ease-in-out ml-2",
					isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
				)}
			>
				<div className="pb-2 mt-1.5 space-y-3">
					{operations.map((operation, index) => (
						<div
							key={`op-${operation.type}-${index}`}
							className="flex items-start gap-2 text-xs"
						>
							<span className="w-1 h-1 bg-gray-400 rounded-full mt-1.5" />
							<div className="flex-1">
								<div className=" text-gray-700 dark:text-foreground mb-2">
									{getOperationLabel(operation)}
								</div>
								<pre className="mt-1 text-xs whitespace-pre-wrap font-mono bg-gray-50 dark:bg-muted p-2 rounded-md px-3 py-2">
									{JSON.stringify(operation.ctx, null, 2)}
								</pre>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

// Loading Dots Component
const LoadingDots: FC = () => {
	return (
		<div className="inline-flex items-center group gap-2 text-xs text-gray-500 dark:text-gray-400 ml-1 my-2">
			<LoaderCircle className="w-3 h-3 animate-spin" />
			<span className="font-medium">Thinking...</span>
		</div>
		// <div className="flex items-center gap-1 my-2 ml-1">
		// 	<div className="flex space-x-1">
		// 		<div className="w-0.5 h-0.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
		// 		<div className="w-0.5 h-0.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
		// 		<div className="w-0.5 h-0.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"></div>
		// 	</div>
		// </div>
	);
};

// StreamMarkdown component that renders with inline citations and data operations
function StreamMarkdown({
	parts,
	isStreaming,
}: {
	parts: any[];
	isStreaming?: boolean;
}) {
	const [processedParts, setProcessedParts] = useState<any[]>([]);
	const [operationTimings, setOperationTimings] = useState<
		Map<string, { startTime: number; isCompleted: boolean }>
	>(new Map());
	const [lastActivityTime, setLastActivityTime] = useState(Date.now());

	// Use ref to track timings to avoid infinite loops
	const timingsRef = useRef(operationTimings);
	timingsRef.current = operationTimings;

	// Process parts to create a mixed array of text and grouped inline operations
	useEffect(() => {
		const processed: any[] = [];
		let currentTextChunk = "";
		let currentOperationGroup: any[] = [];
		let groupStartTime = Date.now();

		// Create a new timings map based on current parts
		const newTimings = new Map<
			string,
			{ startTime: number; isCompleted: boolean }
		>();

		const flushOperationGroup = (isCompleted = false) => {
			if (currentOperationGroup.length > 0) {
				const groupKey = `group-${processed.length}`;
				const existingTiming = timingsRef.current.get(groupKey);

				if (existingTiming) {
					newTimings.set(groupKey, { ...existingTiming, isCompleted });
				} else {
					newTimings.set(groupKey, {
						startTime: groupStartTime,
						isCompleted,
					});
				}

				processed.push({
					type: "operation-group",
					operations: [...currentOperationGroup],
					groupKey,
				});
				currentOperationGroup = [];
			}
		};

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];

			if (part.type === "text") {
				// Mark any pending operation group as completed
				flushOperationGroup(true);

				currentTextChunk += part.text || "";
			} else if (part.type === "data-operation") {
				const { type } = part.data as any;

				// Only add inline operations for non-top-level operations
				// Note: agent_initializing is now treated as inline to show thinking state
				const isTopLevelOperation = [
					"agent_ready",
					"completion",
					"error",
				].includes(type);

				if (!isTopLevelOperation) {
					// If we have accumulated text, add it first
					if (currentTextChunk.trim()) {
						processed.push({ type: "text", content: currentTextChunk });
						currentTextChunk = "";
					}

					// Start a new group if this is the first operation
					if (currentOperationGroup.length === 0) {
						groupStartTime = Date.now();
					}

					// Add operation to current group
					currentOperationGroup.push(part.data);
				}
			} else if (part.type === "data-artifact") {
				// Add artifact as citation marker inline with current text (don't flush)
				const artifactData = part.data as any;
				const artifactSummary = artifactData.artifactSummary || {
					record_type: "site",
					title: artifactData.name,
					url: undefined,
				};
				currentTextChunk += ` ^${artifactSummary?.title || artifactData.name}^`;
			}
		}

		// Flush any remaining operation group (not completed if no text follows)
		flushOperationGroup(false);

		// Add any remaining text
		if (currentTextChunk.trim()) {
			processed.push({ type: "text", content: currentTextChunk });
		}

		setProcessedParts(processed);

		// Update last activity time when we have new content
		setLastActivityTime(Date.now());

		// Only update timings if they've actually changed
		const timingsChanged =
			newTimings.size !== timingsRef.current.size ||
			Array.from(newTimings.entries()).some(([key, value]) => {
				const existing = timingsRef.current.get(key);
				return (
					!existing ||
					existing.isCompleted !== value.isCompleted ||
					existing.startTime !== value.startTime
				);
			});

		if (timingsChanged) {
			setOperationTimings(newTimings);
		}
	}, [parts]);

	// Detect if we should show loading dots
	const shouldShowLoadingDots = () => {
		if (!isStreaming) return false;

		// Check if there are any active thinking operations
		const hasActiveOperations = Array.from(operationTimings.values()).some(
			(timing) => !timing.isCompleted,
		);

		// If there are active operations, don't show dots
		if (hasActiveOperations) return false;

		// Check if there's currently streaming text
		const hasStreamingText = parts.some(
			(part) =>
				part.type === "text" &&
				(part.state === "streaming" || part.state === "partial"),
		);

		// If text is streaming, don't show dots
		if (hasStreamingText) return false;

		// Only show dots if:
		// 1. We have some content already
		// 2. There's been no recent activity (more than 1 second ago)
		// 3. We have text content (not just operations)
		const hasContent = processedParts.length > 0;
		const hasTextContent = parts.some(
			(part) => part.type === "text" && part.text,
		);
		const timeSinceLastActivity = Date.now() - lastActivityTime;
		const hasBeenQuietForAWhile = timeSinceLastActivity > 1000; // 1 second

		return hasContent && hasTextContent && hasBeenQuietForAWhile;
	};

	return (
		<div className="inline">
			{processedParts.map((part, index) => {
				if (part.type === "text") {
					return (
						<Streamdown
							key={`text-${index}-${part.content?.slice(0, 20) || "empty"}`}
							remarkPlugins={[supersub]}
							components={{
								// Intercept superscript elements to render citations
								sup: ({ children, ...props }) => {
									// Check if this is a citation (format: ^artifact identifier^)
									if (children && typeof children === "string") {
										// Find the citation part
										const citation = parts.find(
											(p) =>
												p.type === "data-artifact" &&
												(p.data.artifactSummary?.title || p.data.name) ===
													children,
										);

										if (citation) {
											const artifactData = citation.data as any;
											const artifactSummary = artifactData.artifactSummary || {
												record_type: "site",
												title: artifactData.name,
												url: undefined,
											};

											return (
												<CitationBadge
													citation={{
														key: artifactSummary?.title || artifactData.name,
														href: artifactSummary?.url,
														artifact: { ...artifactData, artifactSummary },
													}}
												/>
											);
										}
									}
									// Default superscript rendering
									return <sup {...props}>{children}</sup>;
								},
							}}
						>
							{part.content}
						</Streamdown>
					);
				} else if (part.type === "operation-group") {
					const timing = operationTimings.get(part.groupKey) || {
						startTime: Date.now(),
						isCompleted: false,
					};

					return (
						<GroupedDataOperations
							key={`${part.groupKey}-${index}`}
							operations={part.operations}
							isCompleted={timing.isCompleted}
							startTime={timing.startTime}
						/>
					);
				}
				return null;
			})}

			{/* Show loading dots when there's a gap in streaming */}
			{shouldShowLoadingDots() && <LoadingDots />}
		</div>
	);
}

export const IkpMessage: FC<IkpMessageProps> = ({
	message,
	isStreaming = false,
	renderMarkdown,
}) => {
	// Extract text content from message parts
	const textContent = message.parts
		.filter((part) => part.type === "text")
		.map((part) => part.text || "")
		.join("");

	if (message.role === "user") {
		return (
			<div className="flex justify-end mb-4">
				<div className="max-w-3xl bg-gray-100 dark:bg-muted text-gray-700 dark:text-foreground rounded-3xl rounded-br-xs px-4 py-2">
					<p className="text-sm">{textContent}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex justify-start">
			<div className="max-w-4xl w-full">
				{/* Main Response */}
				{(textContent ||
					message.parts.some(
						(p) =>
							p.type === "text" ||
							p.type === "data-component" ||
							p.type === "data-operation",
					) ||
					isStreaming) && (
					<div>
						<div className="prose prose-sm max-w-none">
							{/* Render the combined markdown with inline citations using StreamMarkdown */}
							<StreamMarkdown parts={message.parts} isStreaming={isStreaming} />

							{/* Handle data-component parts that weren't processed in the hook */}
							{message.parts
								.filter((part) => part.type === "data-component")
								.map((part) => {
									const { type } = part.data;
									if (type === "text") {
										return (
											<div key={`data-text-${part.id}`}>
												{renderMarkdown(part.data.text || "")}
											</div>
										);
									}

									return (
										<div
											key={`data-component-${part.id}`}
											className="my-2 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden"
										>
											<div className="bg-gray-50 dark:bg-muted px-3 py-1.5 border-b border-gray-200 dark:border-border flex items-center gap-2">
												<div className="flex items-center gap-1.5">
													<div className="w-2 h-2 rounded-full bg-blue-400" />
													<span className="text-xs font-medium text-gray-700 dark:text-foreground">
														Component: {part.data.name || "Unnamed"}
													</span>
												</div>
											</div>
											<div className="p-3">
												<pre className="whitespace-pre-wrap text-xs text-gray-600 dark:text-muted-foreground font-mono">
													{JSON.stringify(part.data, null, 2)}
												</pre>
											</div>
										</div>
									);
								})}
						</div>

						{/* Source badges */}
						{message.parts.some((part) => part.type === "data-artifact") && (
							<div className="mt-3 pt-3">
								<div className="text-xs text-gray-500 dark:text-muted-foreground font-medium mb-2">
									Sources
								</div>
								<div className="space-y-2">
									{message.parts
										.filter((part) => part.type === "data-artifact")
										.map((part, index) => {
											const artifact = part.data;
											const artifactSummary = artifact.artifactSummary || {
												record_type: "site",
												title: artifact.name,
												url: undefined,
											};

											return (
												<div
													key={artifact.artifactId || `artifact-${index}`}
													className="inline-block mr-2 mb-2"
												>
													<Tooltip>
														<TooltipTrigger asChild>
															<a
																href={artifactSummary?.url}
																target="_blank"
																rel="noopener noreferrer"
																className="inline-flex items-center gap-1 px-2 py-1 border border-border rounded-sm text-xs text-gray-700 dark:text-foreground hover:bg-gray-100 dark:hover:bg-muted transition-colors"
															>
																<BookOpen className="w-3 h-3 text-gray-500 dark:text-muted-foreground" />
																<span className="max-w-32 truncate">
																	{artifactSummary?.title || artifact.name}
																</span>
															</a>
														</TooltipTrigger>
														<TooltipContent className="max-w-xs">
															<div className="p-2">
																<div className="font-medium text-sm mb-1 text-popover-foreground">
																	{artifact.name}
																</div>
																<div className="text-xs text-muted-foreground leading-relaxed">
																	{artifact.description}
																</div>
															</div>
														</TooltipContent>
													</Tooltip>
												</div>
											);
										})}
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

export default IkpMessage;
