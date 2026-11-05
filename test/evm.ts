import { createEVM, type EVM } from "@ethereumjs/evm";
import { createAddressFromString, hexToBytes, type Address } from "@ethereumjs/util";
import { decodeFunctionResult, encodeFunctionData, type Abi, type Hex } from "viem";
import { compile } from "../scripts/compile.js";

/** A tiny in-process EVM for testing pure contracts. Frame opcodes are not available here. */
export class TestChain {
  private constructor(private evm: EVM, private artifacts: ReturnType<typeof compile>) {}

  static async create() {
    return new TestChain(await createEVM(), compile());
  }

  private caller = createAddressFromString("0x00000000000000000000000000000000000c0ffe");

  async deploy(name: string) {
    const a = this.artifacts[name];
    if (!a) throw new Error(`no artifact ${name}`);
    const res = await this.evm.runCall({ caller: this.caller, data: hexToBytes(a.bytecode as Hex), gasLimit: 30_000_000n });
    if (res.execResult.exceptionError || !res.createdAddress) throw new Error(`deploy ${name} failed: ${res.execResult.exceptionError?.error}`);
    return new Deployed(this.evm, this.caller, res.createdAddress, a.abi as Abi);
  }
}

export class Deployed {
  constructor(private evm: EVM, private caller: Address, public address: Address, private abi: Abi) {}

  /** Static-style call. Returns decoded outputs and the execution gas (excludes the 21k base and calldata). */
  async call(functionName: string, args: unknown[]): Promise<{ out: any; gas: bigint }> {
    const data = encodeFunctionData({ abi: this.abi, functionName, args });
    const res = await this.evm.runCall({ caller: this.caller, to: this.address, data: hexToBytes(data), gasLimit: 30_000_000n });
    if (res.execResult.exceptionError) throw new Error(`call ${functionName} reverted: ${res.execResult.exceptionError.error}`);
    const out = decodeFunctionResult({ abi: this.abi, functionName, data: `0x${Buffer.from(res.execResult.returnValue).toString("hex")}` });
    return { out, gas: res.execResult.executionGasUsed };
  }
}
