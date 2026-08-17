const { Kafka } = require('kafkajs');
const config = require('../config');

const kafka = new Kafka({
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  retry: {
    initialRetryTime: 100,
    retries: 0,
  },
  connectionTimeout: 1000,
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'parser-service' });

let producerConnected = false;
let consumerConnected = false;

async function connectProducer() {
  if (!producerConnected) {
    try {
      await producer.connect();
      producerConnected = true;
      console.log('[Kafka] Producer connected');
    } catch (e) {
      console.warn('[Kafka] Producer connection skipped (Kafka offline)');
    }
  }
}

async function connectConsumer() {
  if (!consumerConnected) {
    try {
      await consumer.connect();
      consumerConnected = true;
      console.log('[Kafka] Consumer connected');
    } catch (e) {
      console.warn('[Kafka] Consumer connection skipped (Kafka offline)');
    }
  }
}

async function disconnectAll() {
  if (producerConnected) {
    try { await producer.disconnect(); } catch (e) {}
    producerConnected = false;
  }
  if (consumerConnected) {
    try { await consumer.disconnect(); } catch (e) {}
    consumerConnected = false;
  }
  console.log('[Kafka] Disconnected');
}

function isConsumerConnected() {
  return consumerConnected;
}

module.exports = {
  kafka,
  producer,
  consumer,
  connectProducer,
  connectConsumer,
  disconnectAll,
  isConsumerConnected,
};
