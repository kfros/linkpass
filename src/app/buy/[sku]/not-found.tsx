export default function NotFound() {
    return (
        <main className="p-6 space-y-2">
            <h1 className="text-2xl font-semibold">Pass Not Found</h1>
            <p className="text-muted-foreground">
                The pass you are looking for does not exist. Please check the SKU and try again.
            </p>
        </main>
    );
}