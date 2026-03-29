import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { CostEvent, Env } from './types';

export async function emitCostEvent(event: CostEvent, env: Env): Promise<void> {
  const client = new SQSClient({
    region: 'us-east-1',
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    await client.send(
      new SendMessageCommand({
        QueueUrl: env.SQS_QUEUE_URL,
        MessageBody: JSON.stringify(event),
      }),
    );
  } catch (err) {
    console.error('[sqsEmitter] failed to emit cost event:', err);
  }
}
