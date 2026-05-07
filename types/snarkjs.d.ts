declare module 'snarkjs' {
    export const groth16: {
        fullProve: (...args: any[]) => Promise<any>
        verify: (...args: any[]) => Promise<boolean>
    }
}