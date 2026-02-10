#!/usr/bin/env python3
"""Test script to verify LLM API connections."""

import json

def load_config():
    with open("llm.key", "r") as f:
        return json.load(f)

CONFIG = load_config()

def test_gemini():
    """Test Gemini API connection."""
    print("Testing Gemini API...")
    try:
        import google.generativeai as genai
        genai.configure(api_key=CONFIG["gemini_api_key"])
        model = genai.GenerativeModel(CONFIG["gemini_model"])
        response = model.generate_content("Say 'Hello, Gemini is working!' in exactly those words.")
        print(f"  ✓ Gemini: {response.text.strip()}")
        return True
    except Exception as e:
        print(f"  ✗ Gemini failed: {e}")
        return False

def test_claude():
    """Test Claude via AWS Bedrock."""
    print("Testing Claude (AWS Bedrock) API...")
    try:
        import boto3
        client = boto3.client(
            "bedrock-runtime",
            aws_access_key_id=CONFIG["aws_access_key_id"],
            aws_secret_access_key=CONFIG["aws_secret_access_key"],
            region_name=CONFIG["aws_region"]
        )
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 100,
            "messages": [
                {"role": "user", "content": "Say 'Hello, Claude is working!' in exactly those words."}
            ]
        })
        response = client.invoke_model(
            modelId=CONFIG["claude_model"],
            body=body
        )
        response_body = json.loads(response["body"].read())
        print(f"  ✓ Claude: {response_body['content'][0]['text'].strip()}")
        return True
    except Exception as e:
        print(f"  ✗ Claude failed: {e}")
        return False

def test_azure():
    """Test Azure OpenAI API."""
    print("Testing Azure OpenAI API...")
    try:
        from openai import AzureOpenAI
        client = AzureOpenAI(
            api_key=CONFIG["azure_api_key"],
            api_version=CONFIG["azure_api_version"],
            azure_endpoint=CONFIG["azure_endpoint"]
        )
        response = client.chat.completions.create(
            model=CONFIG["azure_deployment"],
            messages=[
                {"role": "user", "content": "Say 'Hello, Azure is working!' in exactly those words."}
            ],
            max_tokens=100
        )
        print(f"  ✓ Azure: {response.choices[0].message.content.strip()}")
        return True
    except Exception as e:
        print(f"  ✗ Azure failed: {e}")
        return False

if __name__ == "__main__":
    print("=" * 50)
    print("LLM API Connection Test")
    print("=" * 50)
    print()
    
    results = {}
    results["gemini"] = test_gemini()
    print()
    results["claude"] = test_claude()
    print()
    results["azure"] = test_azure()
    
    print()
    print("=" * 50)
    print("Summary")
    print("=" * 50)
    for name, success in results.items():
        status = "✓ PASS" if success else "✗ FAIL"
        print(f"  {name}: {status}")
