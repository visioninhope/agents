import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoIcon } from 'lucide-react';

export function ProviderConfigHelp() {
  return (
    <Alert className="mt-4">
      <InfoIcon className="h-4 w-4" />
      <AlertTitle>Provider Configuration Guide</AlertTitle>
      <AlertDescription className="mt-2">
        <Tabs defaultValue="standard" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="standard">Standard</TabsTrigger>
            <TabsTrigger value="openrouter">OpenRouter</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
            <TabsTrigger value="apikeys">API Keys</TabsTrigger>
          </TabsList>
          
          <TabsContent value="standard" className="space-y-2">
            <p className="text-sm">
              For Anthropic and OpenAI models, you typically only need to configure generation parameters:
            </p>
            <pre className="text-xs bg-muted p-2 rounded">
{`{
  "temperature": 0.7,
  "maxTokens": 2048,
  "topP": 0.95
}`}
            </pre>
          </TabsContent>
          
          <TabsContent value="openrouter" className="space-y-2">
            <p className="text-sm">
              OpenRouter provides access to many models through a unified API:
            </p>
            <pre className="text-xs bg-muted p-2 rounded">
{`{
  "temperature": 0.7,
  "maxTokens": 2048,
  // Optional: Override default OpenRouter URL
  "baseURL": "https://openrouter.ai/api/v1",
  // Optional: Add custom headers
  "headers": {
    "HTTP-Referer": "https://your-app.com"
  }
}`}
            </pre>
            <p className="text-xs text-muted-foreground">
              Set OPENROUTER_API_KEY environment variable or include apiKey in options.
            </p>
          </TabsContent>
          
          <TabsContent value="custom" className="space-y-2">
            <p className="text-sm">
              Configure any OpenAI-compatible API endpoint:
            </p>
            <pre className="text-xs bg-muted p-2 rounded">
{`{
  "baseURL": "https://api.your-provider.com/v1",
  "temperature": 0.7,
  "maxTokens": 2048,
  // Optional: Add authentication
  "apiKey": "your-api-key",
  // Optional: Custom headers
  "headers": {
    "X-Custom-Header": "value"
  }
}`}
            </pre>
          </TabsContent>
          
          <TabsContent value="apikeys" className="space-y-2">
            <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">API Key Management</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <p>
                  <strong>Recommended:</strong> Use environment variables:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>ANTHROPIC_API_KEY</li>
                  <li>OPENAI_API_KEY</li>
                  <li>OPENROUTER_API_KEY</li>
                </ul>
                <p className="text-muted-foreground">
                  While you can include apiKey in provider options, using environment variables is more secure.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </AlertDescription>
    </Alert>
  );
}