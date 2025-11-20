# Script para agregar markForCheck() después de showDataModal = true

$componentsPath = "C:\Users\DESARROLLO\Documents\Codigos\Ecos-oraculo\Ecos-oraculo\src\app\components"

# Patrones a buscar y reemplazar
$patterns = @(
    @{
        Old = "this.showDataModal = true;`n          console.log"
        New = "this.showDataModal = true;`n          this.cdr.markForCheck();`n          console.log"
    },
    @{
        Old = "this.showDataModal = true;`n        return;"
        New = "this.showDataModal = true;`n        this.cdr.markForCheck();`n        return;"
    },
    @{
        Old = "this.showDataModal = true; // Mantener modal abierto`n      return;"
        New = "this.showDataModal = true; // Mantener modal abierto`n      this.cdr.markForCheck();`n      return;"
    },
    @{
        Old = "this.showDataModal = true;`n      console.log"
        New = "this.showDataModal = true;`n      this.cdr.markForCheck();`n      console.log"
    }
)

Get-ChildItem -Path $componentsPath -Recurse -Filter "*.component.ts" | ForEach-Object {
    $file = $_
    $content = Get-Content $file.FullName -Raw
    $modified = $false
    
    foreach ($pattern in $patterns) {
        if ($content -match [regex]::Escape($pattern.Old)) {
            $content = $content -replace [regex]::Escape($pattern.Old), $pattern.New
            $modified = $true
        }
    }
    
    if ($modified) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        Write-Host "✅ Modificado: $($file.Name)" -ForegroundColor Green
    }
}

Write-Host "`n✨ Proceso completado" -ForegroundColor Cyan
