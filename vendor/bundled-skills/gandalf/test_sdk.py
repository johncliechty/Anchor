import asyncio
import sys
from google.antigravity import Agent, LocalAgentConfig, CapabilitiesConfig

async def main():
    prompt = sys.stdin.read()
    if not prompt:
        sys.exit(1)
        
    config = LocalAgentConfig(
        capabilities=CapabilitiesConfig(),
    )

    async with Agent(config) as agent:
        response = await agent.chat(prompt)
        async for token in response:
            sys.stdout.write(token)
            sys.stdout.flush()

if __name__ == "__main__":
    asyncio.run(main())
